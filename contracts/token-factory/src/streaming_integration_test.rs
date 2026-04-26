#[cfg(test)]
mod streaming_integration_tests {
    use crate::streaming;
    use crate::storage;
    use crate::types::{Error, StreamParams};
    use soroban_sdk::{testutils::{Address as _, Ledger}, vec, Address, Env};

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);

        // Initialize storage
        storage::set_admin(&env, &admin);
        storage::set_paused(&env, false);

        // Create a token for streaming
        let token_info = crate::types::TokenInfo {
            address: Address::generate(&env),
            creator: creator.clone(),
            name: soroban_sdk::String::from_str(&env, "Test Token"),
            symbol: soroban_sdk::String::from_str(&env, "TST"),
            decimals: 7,
            total_supply: 1_000_000_0000000,
            initial_supply: 1_000_000_0000000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
        metadata_version: 0,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        
        };
        storage::set_token_info(&env, 0, &token_info);

        (env, admin, creator, recipient)
    }

    #[test]
    fn test_create_stream_success() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let result = streaming::create_stream(&env, &creator, &params);
        assert!(result.is_ok());

        let stream_id = result.unwrap();
        assert_eq!(stream_id, 0);

        // Verify stream was stored
        let stream = storage::get_stream(&env, stream_id).unwrap();
        assert_eq!(stream.creator, creator);
        assert_eq!(stream.recipient, recipient);
        assert_eq!(stream.total_amount, 1000);
        assert_eq!(stream.claimed_amount, 0);
        assert!(!stream.cancelled);
    }

    #[test]
    fn test_batch_create_streams_all_valid() {
        let (env, _admin, creator, recipient) = setup();

        let recipient2 = Address::generate(&env);
        let recipient3 = Address::generate(&env);

        let streams = vec![
            &env,
            StreamParams {
                recipient: recipient.clone(),
                token_index: 0,
                total_amount: 1000,
                start_time: 100,
                end_time: 200,
                cliff_time: 150,
            },
            StreamParams {
                recipient: recipient2.clone(),
                token_index: 0,
                total_amount: 2000,
                start_time: 100,
                end_time: 200,
                cliff_time: 150,
            },
            StreamParams {
                recipient: recipient3.clone(),
                token_index: 0,
                total_amount: 3000,
                start_time: 100,
                end_time: 200,
                cliff_time: 150,
            },
        ];

        let result = streaming::batch_create_streams(&env, &creator, &streams);
        assert!(result.is_ok());

        let stream_ids = result.unwrap();
        assert_eq!(stream_ids.len(), 3);

        // Verify all streams were created
        for (i, stream_id) in stream_ids.iter().enumerate() {
            let stream = storage::get_stream(&env, stream_id).unwrap();
            assert_eq!(stream.creator, creator);
            assert_eq!(stream.total_amount, (i as i128 + 1) * 1000);
        }
    }

    #[test]
    fn test_batch_create_streams_one_invalid_rollback() {
        let (env, _admin, creator, recipient) = setup();

        let recipient2 = Address::generate(&env);

        let streams = vec![
            &env,
            StreamParams {
                recipient: recipient.clone(),
                token_index: 0,
                total_amount: 1000,
                start_time: 100,
                end_time: 200,
                cliff_time: 150,
            },
            StreamParams {
                recipient: recipient2.clone(),
                token_index: 0,
                total_amount: 0, // Invalid amount
                start_time: 100,
                end_time: 200,
                cliff_time: 150,
            },
        ];

        let result = streaming::batch_create_streams(&env, &creator, &streams);
        assert_eq!(result, Err(Error::InvalidAmount));

        // Verify no streams were created (rollback)
        assert!(storage::get_stream(&env, 0).is_none());
        assert!(storage::get_stream(&env, 1).is_none());
    }

    #[test]
    fn test_batch_create_streams_exceeds_max_size() {
        let (env, _admin, creator, recipient) = setup();

        // Create 101 streams (exceeds max of 100)
        let mut streams = soroban_sdk::Vec::new(&env);
        for _ in 0..101 {
            streams.push_back(StreamParams {
                recipient: recipient.clone(),
                token_index: 0,
                total_amount: 1000,
                start_time: 100,
                end_time: 200,
                cliff_time: 150,
            });
        }

        let result = streaming::batch_create_streams(&env, &creator, &streams);
        assert_eq!(result, Err(Error::BatchTooLarge));
    }

    #[test]
    fn test_batch_create_streams_empty() {
        let (env, _admin, creator, _recipient) = setup();

        let streams = soroban_sdk::Vec::new(&env);

        let result = streaming::batch_create_streams(&env, &creator, &streams);
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_claim_stream_before_cliff() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Set time before cliff
        env.ledger().with_mut(|li| {
            li.timestamp = 140;
        });

        let result = streaming::claim_stream(&env, &recipient, stream_id);
        assert_eq!(result, Err(Error::CliffNotReached));
    }

    #[test]
    fn test_claim_stream_after_cliff() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Set time after cliff (halfway through vesting)
        env.ledger().with_mut(|li| {
            li.timestamp = 150;
        });

        let result = streaming::claim_stream(&env, &recipient, stream_id);
        assert!(result.is_ok());

        let claimed = result.unwrap();
        assert_eq!(claimed, 500); // 50% vested

        // Verify stream state updated
        let stream = storage::get_stream(&env, stream_id).unwrap();
        assert_eq!(stream.claimed_amount, 500);
    }

    #[test]
    fn test_claim_stream_after_end() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Set time after end
        env.ledger().with_mut(|li| {
            li.timestamp = 250;
        });

        let result = streaming::claim_stream(&env, &recipient, stream_id);
        assert!(result.is_ok());

        let claimed = result.unwrap();
        assert_eq!(claimed, 1000); // 100% vested

        // Verify stream state updated
        let stream = storage::get_stream(&env, stream_id).unwrap();
        assert_eq!(stream.claimed_amount, 1000);
    }

    #[test]
    fn test_claim_stream_multiple_times() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // First claim at 50%
        env.ledger().with_mut(|li| {
            li.timestamp = 150;
        });
        let claimed1 = streaming::claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed1, 500);

        // Second claim at 75%
        env.ledger().with_mut(|li| {
            li.timestamp = 175;
        });
        let claimed2 = streaming::claim_stream(&env, &recipient, stream_id).unwrap();
        assert_eq!(claimed2, 250); // Only the delta

        // Verify total claimed
        let stream = storage::get_stream(&env, stream_id).unwrap();
        assert_eq!(stream.claimed_amount, 750);
    }

    #[test]
    fn test_claim_stream_nothing_to_claim() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Claim everything
        env.ledger().with_mut(|li| {
            li.timestamp = 250;
        });
        streaming::claim_stream(&env, &recipient, stream_id).unwrap();

        // Try to claim again
        let result = streaming::claim_stream(&env, &recipient, stream_id);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_claim_stream_unauthorized() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Try to claim as wrong address
        let wrong_recipient = Address::generate(&env);
        env.ledger().with_mut(|li| {
            li.timestamp = 150;
        });

        let result = streaming::claim_stream(&env, &wrong_recipient, stream_id);
        assert_eq!(result, Err(Error::Unauthorized));
    }

    #[test]
    fn test_cancel_stream_success() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        let result = streaming::cancel_stream(&env, &creator, stream_id);
        assert!(result.is_ok());

        // Verify stream is cancelled
        let stream = storage::get_stream(&env, stream_id).unwrap();
        assert!(stream.cancelled);
    }

    #[test]
    fn test_cancel_stream_unauthorized() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Try to cancel as wrong address
        let wrong_creator = Address::generate(&env);
        let result = streaming::cancel_stream(&env, &wrong_creator, stream_id);
        assert_eq!(result, Err(Error::Unauthorized));
    }

    #[test]
    fn test_cancel_stream_already_cancelled() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Cancel once
        streaming::cancel_stream(&env, &creator, stream_id).unwrap();

        // Try to cancel again
        let result = streaming::cancel_stream(&env, &creator, stream_id);
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_claim_cancelled_stream() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Cancel stream
        streaming::cancel_stream(&env, &creator, stream_id).unwrap();

        // Try to claim
        env.ledger().with_mut(|li| {
            li.timestamp = 150;
        });

        let result = streaming::claim_stream(&env, &recipient, stream_id);
        assert_eq!(result, Err(Error::StreamCancelled));
    }

    #[test]
    fn test_get_stream() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        let stream = streaming::get_stream(&env, stream_id);
        assert!(stream.is_some());

        let stream = stream.unwrap();
        assert_eq!(stream.creator, creator);
        assert_eq!(stream.recipient, recipient);
        assert_eq!(stream.total_amount, 1000);
    }

    #[test]
    fn test_get_claimable_amount() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let stream_id = streaming::create_stream(&env, &creator, &params).unwrap();

        // Before cliff
        env.ledger().with_mut(|li| {
            li.timestamp = 140;
        });
        let claimable = streaming::get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable, 0);

        // At cliff (50%)
        env.ledger().with_mut(|li| {
            li.timestamp = 150;
        });
        let claimable = streaming::get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable, 500);

        // After end (100%)
        env.ledger().with_mut(|li| {
            li.timestamp = 250;
        });
        let claimable = streaming::get_claimable_amount(&env, stream_id).unwrap();
        assert_eq!(claimable, 1000);
    }

    #[test]
    fn test_validate_stream_params_invalid_amount() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 0, // Invalid
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let result = streaming::create_stream(&env, &creator, &params);
        assert_eq!(result, Err(Error::InvalidAmount));
    }

    #[test]
    fn test_validate_stream_params_invalid_times() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 200, // Start after end
            end_time: 100,
            cliff_time: 150,
        };

        let result = streaming::create_stream(&env, &creator, &params);
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_validate_stream_params_invalid_cliff() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 250, // Cliff after end
        };

        let result = streaming::create_stream(&env, &creator, &params);
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_validate_stream_params_token_not_found() {
        let (env, _admin, creator, recipient) = setup();

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 999, // Non-existent token
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let result = streaming::create_stream(&env, &creator, &params);
        assert_eq!(result, Err(Error::TokenNotFound));
    }

    #[test]
    fn test_contract_paused() {
        let (env, _admin, creator, recipient) = setup();

        // Pause contract
        storage::set_paused(&env, true);

        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };

        let result = streaming::create_stream(&env, &creator, &params);
        assert_eq!(result, Err(Error::ContractPaused));
    }
}
