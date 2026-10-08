#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol,
};

const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND_TO: u32 = 535_000;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CampaignStatus {
    Active,
    Paused,
    Closed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub id: Symbol,
    pub owner: Address,
    pub token: Address,
    pub goal_amount: i128,
    pub total_raised: i128,
    pub total_withdrawn: i128,
    pub end_ledger: u32,
    pub status: CampaignStatus,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Campaign(Symbol),
    Contribution(Symbol, Address),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AidFlowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    CampaignExists = 4,
    CampaignNotFound = 5,
    InvalidAmount = 6,
    InvalidDeadline = 7,
    CampaignInactive = 8,
    GoalReached = 9,
    AmountExceedsGoal = 10,
    CampaignNotEnded = 11,
    GoalNotReached = 12,
    NothingToWithdraw = 13,
    RefundUnavailable = 14,
    InsufficientContribution = 15,
    Overflow = 16,
}

#[contract]
pub struct AidFlowContract;

#[contractimpl]
impl AidFlowContract {
    /// Initialize the contract once. The admin controls campaign registration.
    pub fn initialize(env: Env, admin: Address) -> Result<(), AidFlowError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(AidFlowError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Register a campaign. The admin is responsible for verifying its owner
    /// and off-chain organization before publishing it.
    pub fn create_campaign(
        env: Env,
        admin: Address,
        id: Symbol,
        owner: Address,
        token: Address,
        goal_amount: i128,
        end_ledger: u32,
    ) -> Result<(), AidFlowError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        if goal_amount <= 0 {
            return Err(AidFlowError::InvalidAmount);
        }
        if end_ledger <= env.ledger().sequence() {
            return Err(AidFlowError::InvalidDeadline);
        }

        let key = DataKey::Campaign(id.clone());
        if env.storage().persistent().has(&key) {
            return Err(AidFlowError::CampaignExists);
        }

        let campaign = Campaign {
            id: id.clone(),
            owner,
            token,
            goal_amount,
            total_raised: 0,
            total_withdrawn: 0,
            end_ledger,
            status: CampaignStatus::Active,
        };
        Self::store_campaign(&env, &key, &campaign);
        env.events().publish(
            (Symbol::new(&env, "campaign_created"), id),
            (campaign.owner, campaign.goal_amount, campaign.end_ledger),
        );
        Ok(())
    }

    /// Transfer tokens from a donor into contract custody and record the
    /// contribution atomically. Amounts use the token's smallest unit.
    pub fn contribute(
        env: Env,
        campaign_id: Symbol,
        donor: Address,
        amount: i128,
    ) -> Result<(), AidFlowError> {
        donor.require_auth();
        let key = DataKey::Campaign(campaign_id.clone());
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(AidFlowError::CampaignNotFound)?;

        if campaign.status != CampaignStatus::Active
            || env.ledger().sequence() > campaign.end_ledger
        {
            return Err(AidFlowError::CampaignInactive);
        }
        if amount <= 0 {
            return Err(AidFlowError::InvalidAmount);
        }

        let remaining = campaign
            .goal_amount
            .checked_sub(campaign.total_raised)
            .ok_or(AidFlowError::Overflow)?;
        if remaining <= 0 {
            return Err(AidFlowError::GoalReached);
        }
        if amount > remaining {
            return Err(AidFlowError::AmountExceedsGoal);
        }

        token::Client::new(&env, &campaign.token).transfer(
            &donor,
            &env.current_contract_address(),
            &amount,
        );

        campaign.total_raised = campaign
            .total_raised
            .checked_add(amount)
            .ok_or(AidFlowError::Overflow)?;
        Self::store_campaign(&env, &key, &campaign);

        let contribution_key = DataKey::Contribution(campaign_id.clone(), donor.clone());
        let previous: i128 = env
            .storage()
            .persistent()
            .get(&contribution_key)
            .unwrap_or(0);
        let total = previous
            .checked_add(amount)
            .ok_or(AidFlowError::Overflow)?;
        env.storage().persistent().set(&contribution_key, &total);
        env.storage().persistent().extend_ttl(
            &contribution_key,
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );

        env.events().publish(
            (Symbol::new(&env, "contributed"), campaign_id),
            (donor, amount, campaign.total_raised),
        );
        Ok(())
    }

    /// Release the raised amount to the verified campaign owner once the goal
    /// is reached. The contract performs the transfer and state update atomically.
    pub fn withdraw(
        env: Env,
        campaign_id: Symbol,
        owner: Address,
    ) -> Result<i128, AidFlowError> {
        owner.require_auth();
        let key = DataKey::Campaign(campaign_id.clone());
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(AidFlowError::CampaignNotFound)?;

        if campaign.owner != owner {
            return Err(AidFlowError::Unauthorized);
        }
        if campaign.total_raised < campaign.goal_amount {
            if env.ledger().sequence() <= campaign.end_ledger {
                return Err(AidFlowError::CampaignNotEnded);
            }
            return Err(AidFlowError::GoalNotReached);
        }

        let amount = campaign
            .total_raised
            .checked_sub(campaign.total_withdrawn)
            .ok_or(AidFlowError::Overflow)?;
        if amount <= 0 {
            return Err(AidFlowError::NothingToWithdraw);
        }

        token::Client::new(&env, &campaign.token).transfer(
            &env.current_contract_address(),
            &owner,
            &amount,
        );
        campaign.total_withdrawn = campaign
            .total_withdrawn
            .checked_add(amount)
            .ok_or(AidFlowError::Overflow)?;
        campaign.status = CampaignStatus::Closed;
        Self::store_campaign(&env, &key, &campaign);

        env.events().publish(
            (Symbol::new(&env, "withdrawn"), campaign_id),
            (owner, amount),
        );
        Ok(amount)
    }

    /// Refund a donor when a campaign deadline has passed without reaching its
    /// goal. Partial refunds are allowed; the donor cannot claim more than
    /// their recorded contribution.
    pub fn refund(
        env: Env,
        campaign_id: Symbol,
        donor: Address,
        amount: i128,
    ) -> Result<i128, AidFlowError> {
        donor.require_auth();
        let key = DataKey::Campaign(campaign_id.clone());
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(AidFlowError::CampaignNotFound)?;

        if env.ledger().sequence() <= campaign.end_ledger
            || campaign.total_raised >= campaign.goal_amount
        {
            return Err(AidFlowError::RefundUnavailable);
        }
        if amount <= 0 {
            return Err(AidFlowError::InvalidAmount);
        }

        let contribution_key = DataKey::Contribution(campaign_id.clone(), donor.clone());
        let contribution: i128 = env
            .storage()
            .persistent()
            .get(&contribution_key)
            .unwrap_or(0);
        if amount > contribution {
            return Err(AidFlowError::InsufficientContribution);
        }

        token::Client::new(&env, &campaign.token).transfer(
            &env.current_contract_address(),
            &donor,
            &amount,
        );

        env.storage()
            .persistent()
            .set(&contribution_key, &(contribution - amount));
        env.storage().persistent().extend_ttl(
            &contribution_key,
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
        campaign.total_raised = campaign
            .total_raised
            .checked_sub(amount)
            .ok_or(AidFlowError::Overflow)?;
        campaign.status = CampaignStatus::Closed;
        Self::store_campaign(&env, &key, &campaign);

        env.events().publish(
            (Symbol::new(&env, "refunded"), campaign_id),
            (donor, amount),
        );
        Ok(amount)
    }

    pub fn pause_campaign(
        env: Env,
        admin: Address,
        campaign_id: Symbol,
    ) -> Result<(), AidFlowError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let key = DataKey::Campaign(campaign_id);
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(AidFlowError::CampaignNotFound)?;
        if campaign.status != CampaignStatus::Active {
            return Err(AidFlowError::CampaignInactive);
        }
        campaign.status = CampaignStatus::Paused;
        Self::store_campaign(&env, &key, &campaign);
        Ok(())
    }

    pub fn resume_campaign(
        env: Env,
        admin: Address,
        campaign_id: Symbol,
    ) -> Result<(), AidFlowError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let key = DataKey::Campaign(campaign_id);
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(AidFlowError::CampaignNotFound)?;
        if campaign.status != CampaignStatus::Paused
            || env.ledger().sequence() > campaign.end_ledger
            || campaign.total_raised >= campaign.goal_amount
        {
            return Err(AidFlowError::CampaignInactive);
        }
        campaign.status = CampaignStatus::Active;
        Self::store_campaign(&env, &key, &campaign);
        Ok(())
    }

    pub fn get_campaign(env: Env, campaign_id: Symbol) -> Option<Campaign> {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
    }

    pub fn get_contribution(env: Env, campaign_id: Symbol, donor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(campaign_id, donor))
            .unwrap_or(0)
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    pub fn version(_env: Env) -> Symbol {
        Symbol::new(&_env, "aidflow_v1")
    }
}

impl AidFlowContract {
    fn require_admin(env: &Env, supplied: &Address) -> Result<(), AidFlowError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(AidFlowError::NotInitialized)?;
        if &admin != supplied {
            return Err(AidFlowError::Unauthorized);
        }
        Ok(())
    }

    fn store_campaign(env: &Env, key: &DataKey, campaign: &Campaign) {
        env.storage().persistent().set(key, campaign);
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token, Address, Env};

    fn setup() -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let donor = Address::generate(&env);
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin);
        let token_client = token::StellarAssetClient::new(&env, &token.address());
        token_client.mint(&donor, &1_000);
        let contract_id = env.register(AidFlowContract, ());
        let client = AidFlowContractClient::new(&env, &contract_id);
        client.initialize(&admin);
        client.create_campaign(
            &admin,
            &Symbol::new(&env, "campaign_1"),
            &owner,
            &token.address(),
            &500,
            &(env.ledger().sequence() + 10),
        );
        (env, contract_id, admin, owner, donor)
    }

    #[test]
    fn records_contributions_and_prevents_overfunding() {
        let (env, contract_id, _admin, _owner, donor) = setup();
        let client = AidFlowContractClient::new(&env, &contract_id);
        let campaign_id = Symbol::new(&env, "campaign_1");

        client.contribute(&campaign_id, &donor, &300);
        assert_eq!(client.get_contribution(&campaign_id, &donor), 300);
        assert_eq!(client.get_campaign(&campaign_id).unwrap().total_raised, 300);

        assert!(client.try_contribute(&campaign_id, &donor, &201).is_err());
        assert_eq!(client.get_campaign(&campaign_id).unwrap().total_raised, 300);
    }

    #[test]
    fn releases_funds_to_campaign_owner_when_goal_is_met() {
        let (env, contract_id, _admin, owner, donor) = setup();
        let client = AidFlowContractClient::new(&env, &contract_id);
        let campaign_id = Symbol::new(&env, "campaign_1");

        client.contribute(&campaign_id, &donor, &500);
        assert_eq!(client.withdraw(&campaign_id, &owner), 500);
        assert_eq!(client.get_campaign(&campaign_id).unwrap().status, CampaignStatus::Closed);
        assert_eq!(client.get_campaign(&campaign_id).unwrap().total_withdrawn, 500);
    }

    #[test]
    fn refunds_donors_when_goal_is_not_met_before_deadline() {
        let (env, contract_id, _admin, _owner, donor) = setup();
        let client = AidFlowContractClient::new(&env, &contract_id);
        let campaign_id = Symbol::new(&env, "campaign_1");
        client.contribute(&campaign_id, &donor, &100);

        env.ledger().with_mut(|ledger| ledger.sequence_number += 11);
        assert_eq!(client.refund(&campaign_id, &donor, &60), 60);
        assert_eq!(client.get_contribution(&campaign_id, &donor), 40);
        assert_eq!(client.get_campaign(&campaign_id).unwrap().total_raised, 40);
    }

    #[test]
    fn rejects_second_initialization() {
        let (env, contract_id, admin, _owner, _donor) = setup();
        let client = AidFlowContractClient::new(&env, &contract_id);
        assert!(client.try_initialize(&admin).is_err());
        assert_eq!(client.version(), Symbol::new(&env, "aidflow_v1"));
    }
}
