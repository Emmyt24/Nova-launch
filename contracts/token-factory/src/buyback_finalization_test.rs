#[cfg(test)]
mod finalization_tests {
    use crate::buyback::{BuybackContract, CampaignStatus};
    use crate::types::Error;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env};

    fn setup() -> (Env, Address) {
        let env = Env::default();
        let contract_id = env.register_contract(None, BuybackContract);
        (env, contract_id)
    }

    #[test]
    fn test_finalize_completed_campaign() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury.clone(),
                Some(beneficiary.clone()),
                None,
            )
            .unwrap();

            // Spend entire budget
            BuybackContract::execute_buyback_step(env.clone(), 1, 50_000, 4_500_000).unwrap();
            BuybackContract::execute_buyback_step(env.clone(), 1, 50_000, 4_500_000).unwrap();

            // Finalize as completed
            let summary = BuybackContract::finalize_campaign(
                env.clone(),
                1,
                CampaignStatus::Completed,
            )
            .unwrap();

            assert_eq!(summary.campaign_id, 1);
            assert_eq!(summary.status, CampaignStatus::Completed);
            assert_eq!(summary.total_spent, 100_000);
            assert_eq!(summary.residual, 0);
            assert_eq!(summary.returned_to, beneficiary);
        });
    }

    #[test]
    fn test_finalize_expired_campaign_with_residual() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            let end_time = env.ledger().timestamp() + 1000;

            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury.clone(),
                None,
                Some(end_time),
            )
            .unwrap();

            // Partial spend
            BuybackContract::execute_buyback_step(env.clone(), 1, 30_000, 2_500_000).unwrap();

            // Advance time past expiry
            env.ledger().with_mut(|li| li.timestamp = end_time + 1);

            // Finalize as expired
            let summary = BuybackContract::finalize_campaign(
                env.clone(),
                1,
                CampaignStatus::Expired,
            )
            .unwrap();

            assert_eq!(summary.status, CampaignStatus::Expired);
            assert_eq!(summary.total_spent, 30_000);
            assert_eq!(summary.residual, 70_000);
            assert_eq!(summary.returned_to, treasury);
        });
    }

    #[test]
    fn test_finalize_cancelled_campaign() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury.clone(),
                None,
                None,
            )
            .unwrap();

            // Partial spend
            BuybackContract::execute_buyback_step(env.clone(), 1, 20_000, 1_800_000).unwrap();

            // Cancel campaign
            let summary = BuybackContract::cancel_campaign(env.clone(), 1).unwrap();

            assert_eq!(summary.status, CampaignStatus::Cancelled);
            assert_eq!(summary.total_spent, 20_000);
            assert_eq!(summary.residual, 80_000);
            assert_eq!(summary.returned_to, treasury);
        });
    }

    #[test]
    fn test_finalize_completed_fails_if_incomplete() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury,
                None,
                None,
            )
            .unwrap();

            // Partial spend
            BuybackContract::execute_buyback_step(env.clone(), 1, 30_000, 2_500_000).unwrap();

            // Try to finalize as completed
            let result = BuybackContract::finalize_campaign(
                env.clone(),
                1,
                CampaignStatus::Completed,
            );

            assert_eq!(result, Err(Error::InvalidParameters));
        });
    }

    #[test]
    fn test_finalize_expired_fails_before_end_time() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            let end_time = env.ledger().timestamp() + 1000;

            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury,
                None,
                Some(end_time),
            )
            .unwrap();

            // Try to finalize before expiry
            let result = BuybackContract::finalize_campaign(
                env.clone(),
                1,
                CampaignStatus::Expired,
            );

            assert_eq!(result, Err(Error::InvalidParameters));
        });
    }

    #[test]
    fn test_finalize_inactive_campaign_fails() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury,
                None,
                None,
            )
            .unwrap();

            // Cancel first time
            BuybackContract::cancel_campaign(env.clone(), 1).unwrap();

            // Try to finalize again
            let result = BuybackContract::cancel_campaign(env.clone(), 1);

            assert_eq!(result, Err(Error::CampaignInactive));
        });
    }

    #[test]
    fn test_residual_calculation_accuracy() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                1_000_000,
                200_000,
                500,
                treasury.clone(),
                None,
                None,
            )
            .unwrap();

            // Spend various amounts
            BuybackContract::execute_buyback_step(env.clone(), 1, 75_000, 7_000_000).unwrap();
            BuybackContract::execute_buyback_step(env.clone(), 1, 125_000, 11_000_000).unwrap();
            BuybackContract::execute_buyback_step(env.clone(), 1, 50_000, 4_500_000).unwrap();

            let summary = BuybackContract::cancel_campaign(env.clone(), 1).unwrap();

            assert_eq!(summary.total_spent, 250_000);
            assert_eq!(summary.residual, 750_000);
        });
    }

    #[test]
    fn test_beneficiary_vs_treasury_routing() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        env.as_contract(&contract_id, || {
            // Campaign with beneficiary
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token.clone(),
                100_000,
                100_000,
                500,
                treasury.clone(),
                Some(beneficiary.clone()),
                None,
            )
            .unwrap();

            BuybackContract::execute_buyback_step(env.clone(), 1, 100_000, 9_000_000).unwrap();

            let summary1 = BuybackContract::finalize_campaign(
                env.clone(),
                1,
                CampaignStatus::Completed,
            )
            .unwrap();

            // Completed goes to beneficiary
            assert_eq!(summary1.returned_to, beneficiary);

            // Campaign without beneficiary
            BuybackContract::create_campaign(
                env.clone(),
                2,
                token,
                100_000,
                100_000,
                500,
                treasury.clone(),
                None,
                None,
            )
            .unwrap();

            let summary2 = BuybackContract::cancel_campaign(env.clone(), 2).unwrap();

            // Cancelled goes to treasury
            assert_eq!(summary2.returned_to, treasury);
        });
    }

    #[test]
    fn test_zero_residual_finalization() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury.clone(),
                None,
                None,
            )
            .unwrap();

            // Spend exactly the budget
            BuybackContract::execute_buyback_step(env.clone(), 1, 50_000, 4_500_000).unwrap();
            BuybackContract::execute_buyback_step(env.clone(), 1, 50_000, 4_500_000).unwrap();

            let summary = BuybackContract::finalize_campaign(
                env.clone(),
                1,
                CampaignStatus::Completed,
            )
            .unwrap();

            assert_eq!(summary.residual, 0);
            assert_eq!(summary.returned_to, treasury);
        });
    }

    #[test]
    fn test_finalization_marks_campaign_inactive() {
        let (env, contract_id) = setup();
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(&contract_id, || {
            BuybackContract::create_campaign(
                env.clone(),
                1,
                token,
                100_000,
                50_000,
                500,
                treasury,
                None,
                None,
            )
            .unwrap();

            BuybackContract::cancel_campaign(env.clone(), 1).unwrap();

            let campaign = BuybackContract::get_campaign(env.clone(), 1).unwrap();
            assert!(!campaign.active);

            // Cannot execute on inactive campaign
            let result = BuybackContract::execute_buyback_step(env.clone(), 1, 10_000, 900_000);
            assert_eq!(result, Err(Error::CampaignInactive));
        });
    }
}
