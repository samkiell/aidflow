#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol};

/// Minimal deployment/CI placeholder. This does not manage funds yet.
#[contract]
pub struct AidFlowContract;

#[contractimpl]
impl AidFlowContract {
    pub fn version(_env: Env) -> Symbol { Symbol::new(&_env, "aidflow_v0") }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn exposes_version() {
        let env = Env::default();
        let contract_id = env.register(AidFlowContract, ());
        let client = AidFlowContractClient::new(&env, &contract_id);
        assert_eq!(client.version(), Symbol::new(&env, "aidflow_v0"));
    }
}
