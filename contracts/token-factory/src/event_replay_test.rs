#![cfg(test)]
//! Event replay guarantees validated in this module:
//! - Token: admin/treasury/fees/paused, token count, per-token creator/address/total_supply.
//! - Stream: creator/recipient/total_amount/claimed_amount/cancelled.
//! - Governance: per-proposal vote totals and queued/executed/cancelled lifecycle flags.
//! - Unsupported by current schemas (not asserted): per-holder balances and stream token_index.

extern crate std;

use crate::{
    governance, storage, streaming, timelock,
    types::{ActionType, StreamParams, VoteChoice},
    TokenFactory, TokenFactoryClient,
};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    Address, Bytes, Env, String, Symbol, TryFromVal, TryIntoVal, Val,
};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default)]
struct ReplayTokenState {
    address: Option<Address>,
    creator: Option<Address>,
    total_supply: i128,
}

#[derive(Debug, Clone)]
struct ReplayStreamState {
    creator: Address,
    recipient: Address,
    total_amount: i128,
    claimed_amount: i128,
    cancelled: bool,
}

#[derive(Debug, Clone, Default)]
struct ReplayProposalState {
    votes_for: i128,
    votes_against: i128,
    votes_abstain: i128,
    queued: bool,
    executed: bool,
    cancelled: bool,
}

#[derive(Debug, Default)]
struct ReplayState {
    admin: Option<Address>,
    treasury: Option<Address>,
    base_fee: Option<i128>,
    metadata_fee: Option<i128>,
    paused: bool,
    token_count: u32,
    tokens: BTreeMap<u32, ReplayTokenState>,
    streams: BTreeMap<u64, ReplayStreamState>,
    proposals: BTreeMap<u64, ReplayProposalState>,
}

impl ReplayState {
    fn apply(&mut self, env: &Env, topics: &soroban_sdk::Vec<Val>, data: &Val) {
        if topics.len() == 0 {
            return;
        }

        let Ok(topic0) = Symbol::try_from_val(env, &topics.get(0).unwrap()) else {
            return;
        };

        match topic0 {
            s if s == symbol_short!("init_v1") => {
                let decoded: Result<(Address, Address, i128, i128), _> = data.try_into_val(env);
                if let Ok((admin, treasury, base_fee, metadata_fee)) = decoded
                {
                    self.admin = Some(admin);
                    self.treasury = Some(treasury);
                    self.base_fee = Some(base_fee);
                    self.metadata_fee = Some(metadata_fee);
                }
            }
            s if s == symbol_short!("adm_xf_v1") => {
                let decoded: Result<(Address, Address), _> = data.try_into_val(env);
                if let Ok((_old, new_admin)) = decoded {
                    self.admin = Some(new_admin);
                }
            }
            s if s == symbol_short!("pause_v1") => {
                self.paused = true;
            }
            s if s == symbol_short!("unpaus_v1") => {
                self.paused = false;
            }
            s if s == symbol_short!("fee_up_v1") => {
                let decoded: Result<(i128, i128), _> = data.try_into_val(env);
                if let Ok((base_fee, metadata_fee)) = decoded {
                    self.base_fee = Some(base_fee);
                    self.metadata_fee = Some(metadata_fee);
                }
            }
            s if s == symbol_short!("tok_crt") => {
                if topics.len() < 2 {
                    return;
                }
                let token_addr_decoded: Result<Address, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(token_address) = token_addr_decoded else {
                    return;
                };
                let decoded: Result<(Address, String, String, u32, i128), _> = data.try_into_val(env);
                let Ok((creator, _name, _symbol, _decimals, initial_supply)) = decoded
                else {
                    return;
                };

                let idx = self.token_count;
                self.token_count += 1;
                self.tokens.insert(
                    idx,
                    ReplayTokenState {
                        address: Some(token_address),
                        creator: Some(creator),
                        total_supply: initial_supply,
                    },
                );
            }
            s if s == symbol_short!("mint") => {
                if topics.len() < 2 {
                    return;
                }
                let token_idx_decoded: Result<u32, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(token_index) = token_idx_decoded else {
                    return;
                };
                let decoded: Result<(Address, i128), _> = data.try_into_val(env);
                let Ok((_to, amount)) = decoded else {
                    return;
                };
                let token = self.tokens.entry(token_index).or_default();
                token.total_supply += amount;
            }
            s if s == symbol_short!("burn_v1") => {
                if topics.len() < 2 {
                    return;
                }
                let token_idx_decoded: Result<u32, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(token_index) = token_idx_decoded else {
                    return;
                };
                let decoded: Result<(Address, i128, i128), _> = data.try_into_val(env);
                let Ok((_caller, _amount, new_supply)) = decoded
                else {
                    return;
                };
                let token = self.tokens.entry(token_index).or_default();
                token.total_supply = new_supply;
            }
            s if s == symbol_short!("adm_bn_v1") => {
                if topics.len() < 2 {
                    return;
                }
                let token_idx_decoded: Result<u32, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(token_index) = token_idx_decoded else {
                    return;
                };
                let decoded: Result<(Address, Address, i128, i128), _> = data.try_into_val(env);
                let Ok((_admin, _holder, _amount, new_supply)) = decoded
                else {
                    return;
                };
                let token = self.tokens.entry(token_index).or_default();
                token.total_supply = new_supply;
            }
            s if s == symbol_short!("bch_bn_v1") => {
                if topics.len() < 2 {
                    return;
                }
                let token_idx_decoded: Result<u32, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(token_index) = token_idx_decoded else {
                    return;
                };
                let decoded: Result<(Address, u32, i128, i128), _> = data.try_into_val(env);
                let Ok((_admin, _count, _total_burned, new_supply)) = decoded
                else {
                    return;
                };
                let token = self.tokens.entry(token_index).or_default();
                token.total_supply = new_supply;
            }
            s if s == symbol_short!("strm_cr") => {
                let decoded: Result<(u64, Address, Address, i128), _> = data.try_into_val(env);
                let Ok((stream_id, creator, recipient, amount)) = decoded
                else {
                    return;
                };
                self.streams.insert(
                    stream_id,
                    ReplayStreamState {
                        creator,
                        recipient,
                        total_amount: amount,
                        claimed_amount: 0,
                        cancelled: false,
                    },
                );
            }
            s if s == symbol_short!("strm_clm") => {
                let decoded: Result<(u64, Address, i128), _> = data.try_into_val(env);
                let Ok((stream_id, _recipient, amount)) = decoded
                else {
                    return;
                };
                if let Some(stream) = self.streams.get_mut(&stream_id) {
                    stream.claimed_amount += amount;
                }
            }
            s if s == symbol_short!("strm_cnl") => {
                let decoded: Result<(u64, Address), _> = data.try_into_val(env);
                let Ok((stream_id, _creator)) = decoded else {
                    return;
                };
                if let Some(stream) = self.streams.get_mut(&stream_id) {
                    stream.cancelled = true;
                }
            }
            s if s == symbol_short!("prop_crv1") => {
                if topics.len() < 2 {
                    return;
                }
                let proposal_decoded: Result<u64, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(proposal_id) = proposal_decoded else {
                    return;
                };
                let _: Result<(Address, ActionType, u64, u64, u64), _> = data.try_into_val(env);
                self.proposals.entry(proposal_id).or_default();
            }
            s if s == symbol_short!("vote_csv1") => {
                if topics.len() < 2 {
                    return;
                }
                let proposal_decoded: Result<u64, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(proposal_id) = proposal_decoded else {
                    return;
                };
                let decoded: Result<(Address, VoteChoice), _> = data.try_into_val(env);
                let Ok((_voter, choice)) = decoded else {
                    return;
                };
                let proposal = self.proposals.entry(proposal_id).or_default();
                match choice {
                    VoteChoice::For => proposal.votes_for += 1,
                    VoteChoice::Against => proposal.votes_against += 1,
                    VoteChoice::Abstain => proposal.votes_abstain += 1,
                }
            }
            s if s == symbol_short!("prop_quv1") => {
                if topics.len() < 2 {
                    return;
                }
                let proposal_decoded: Result<u64, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(proposal_id) = proposal_decoded else {
                    return;
                };
                self.proposals.entry(proposal_id).or_default().queued = true;
            }
            s if s == symbol_short!("prop_exv1") => {
                if topics.len() < 2 {
                    return;
                }
                let proposal_decoded: Result<u64, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(proposal_id) = proposal_decoded else {
                    return;
                };
                self.proposals.entry(proposal_id).or_default().executed = true;
            }
            s if s == symbol_short!("prop_cav1") => {
                if topics.len() < 2 {
                    return;
                }
                let proposal_decoded: Result<u64, _> = topics.get(1).unwrap().try_into_val(env);
                let Ok(proposal_id) = proposal_decoded else {
                    return;
                };
                self.proposals.entry(proposal_id).or_default().cancelled = true;
            }
            _ => {}
        }
    }
}

fn replay_from_env(env: &Env) -> ReplayState {
    let mut replay = ReplayState::default();
    for event in env.events().all().iter() {
        let (_contract, topics, data) = event;
        replay.apply(env, &topics, &data);
    }
    replay
}

fn setup_factory(env: &Env) -> (TokenFactoryClient<'_>, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &100_000_000, &50_000_000);

    (client, admin, treasury)
}

fn assert_replay_matches_contract(
    env: &Env,
    client: &TokenFactoryClient,
    replay: &ReplayState,
) {
    let state = client.get_state();

    assert_eq!(replay.admin.as_ref(), Some(&state.admin));
    assert_eq!(replay.treasury.as_ref(), Some(&state.treasury));
    assert_eq!(replay.base_fee, Some(state.base_fee));
    assert_eq!(replay.metadata_fee, Some(state.metadata_fee));
    assert_eq!(replay.paused, state.paused);

    let token_count = storage::get_token_count(env);
    assert_eq!(replay.token_count, token_count);

    for idx in 0..token_count {
        let token_info = client.get_token_info(&idx);
        let projected = replay.tokens.get(&idx).expect("missing projected token");
        assert_eq!(projected.address.as_ref(), Some(&token_info.address));
        assert_eq!(projected.creator.as_ref(), Some(&token_info.creator));
        assert_eq!(projected.total_supply, token_info.total_supply);
    }

    for (stream_id, projected) in &replay.streams {
        let stream = streaming::get_stream(env, *stream_id).expect("missing on-chain stream");
        assert_eq!(projected.creator, stream.creator);
        assert_eq!(projected.recipient, stream.recipient);
        assert_eq!(projected.total_amount, stream.total_amount);
        assert_eq!(projected.claimed_amount, stream.claimed_amount);
        assert_eq!(projected.cancelled, stream.cancelled);
    }

    for (proposal_id, projected) in &replay.proposals {
        let proposal = timelock::get_proposal(env, *proposal_id).expect("missing on-chain proposal");
        assert_eq!(projected.votes_for, proposal.votes_for);
        assert_eq!(projected.votes_against, proposal.votes_against);
        assert_eq!(projected.votes_abstain, proposal.votes_abstain);

        if projected.executed {
            assert_eq!(proposal.state, crate::types::ProposalState::Executed);
        }
        if projected.cancelled {
            assert_eq!(proposal.state, crate::types::ProposalState::Cancelled);
        }
        if projected.queued && !projected.executed {
            assert_eq!(proposal.state, crate::types::ProposalState::Queued);
        }
    }
}

fn count_topic(env: &Env, topic: Symbol) -> u32 {
    let mut count = 0u32;
    for event in env.events().all().iter() {
        let (_addr, topics, _data) = event;
        if topics.len() == 0 {
            continue;
        }
        if let Ok(t0) = Symbol::try_from_val(env, &topics.get(0).unwrap()) {
            if t0 == topic {
                count += 1;
            }
        }
    }
    count
}

#[test]
fn replay_roundtrip_token_stream_governance() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (client, admin, _treasury) = setup_factory(&env);

    governance::initialize_governance(&env, Some(30), Some(51)).unwrap();

    let token_addr = client
        .create_token(
            &admin,
            &String::from_str(&env, "Replay Token"),
            &String::from_str(&env, "RPLY"),
            &7,
            &1_000_000_000,
            &None,
            &100_000_000,
        );
    let _ = token_addr;

    client.mint(&admin, &0, &admin, &250_000_000);
    client.burn(&admin, &0, &100_000_000);

    let recipient = Address::generate(&env);
    let stream_id = streaming::create_stream(
        &env,
        &admin,
        &StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 600_000_000,
            start_time: 1_000,
            end_time: 2_000,
            cliff_time: 1_000,
        },
    )
    .unwrap();

    env.ledger().with_mut(|li| li.timestamp = 1_600);
    streaming::claim_stream(&env, &recipient, stream_id).unwrap();
    streaming::cancel_stream(&env, &admin, stream_id).unwrap();

    let proposal_id = timelock::create_proposal(
        &env,
        &admin,
        ActionType::FeeChange,
        Bytes::from_slice(&env, &[1, 2, 3, 4, 5, 6, 7, 8]),
        1_700,
        1_800,
        1_900,
    )
    .unwrap();

    env.ledger().with_mut(|li| li.timestamp = 1_750);
    timelock::vote_proposal(&env, &Address::generate(&env), proposal_id, VoteChoice::For).unwrap();

    env.ledger().with_mut(|li| li.timestamp = 1_850);
    timelock::queue_proposal(&env, proposal_id).unwrap();

    env.ledger().with_mut(|li| li.timestamp = 2_000);
    timelock::execute_proposal(&env, proposal_id).unwrap();

    let replay = replay_from_env(&env);
    assert_replay_matches_contract(&env, &client, &replay);
}

#[test]
fn replay_matches_after_randomized_operation_sequences() {
    for seed in 1u64..=8u64 {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| li.timestamp = 1_000 + seed);

        let (client, admin, _treasury) = setup_factory(&env);
        governance::initialize_governance(&env, Some(20), Some(51)).unwrap();

        client
            .create_token(
                &admin,
                &String::from_str(&env, "SeedToken"),
                &String::from_str(&env, "SEED"),
                &7,
                &1_500_000_000,
                &None,
                &100_000_000,
            );

        let mut rng = seed;
        let mut current_admin = admin.clone();
        let mut streams: std::vec::Vec<(u64, Address)> = std::vec::Vec::new();
        let mut proposals: std::vec::Vec<u64> = std::vec::Vec::new();

        for step in 0..64u64 {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
            let op = (rng % 14) as u32;
            let now = 1_200 + step * 20;
            env.ledger().with_mut(|li| li.timestamp = now);

            match op {
                0 => {
                    let _ = client.try_update_fees(
                        &current_admin,
                        &Some(100_000_000 + (step as i128 * 1_000)),
                        &Some(50_000_000 + (step as i128 * 500)),
                    );
                }
                1 => {
                    let _ = client.try_pause(&current_admin);
                }
                2 => {
                    let _ = client.try_unpause(&current_admin);
                }
                3 => {
                    let new_admin = Address::generate(&env);
                    if client.try_transfer_admin(&current_admin, &new_admin).is_ok() {
                        current_admin = new_admin;
                    }
                }
                4 => {
                    let creator = Address::generate(&env);
                    let _ = client.try_create_token(
                        &creator,
                        &String::from_str(&env, "RandToken"),
                        &String::from_str(&env, "RAND"),
                        &7,
                        &200_000_000,
                        &None,
                        &100_000_000,
                    );
                }
                5 => {
                    let _ = client.try_mint(&admin, &0, &admin, &10_000);
                }
                6 => {
                    let _ = client.try_burn(&admin, &0, &5_000);
                }
                7 => {
                    let recipient = Address::generate(&env);
                    if let Ok(id) = streaming::create_stream(
                        &env,
                        &admin,
                        &StreamParams {
                            recipient: recipient.clone(),
                            token_index: 0,
                            total_amount: 100_000,
                            start_time: now,
                            end_time: now + 100,
                            cliff_time: now,
                        },
                    ) {
                        streams.push((id, recipient));
                    }
                }
                8 => {
                    if !streams.is_empty() {
                        let idx = (rng as usize) % streams.len();
                        let (id, recipient) = streams[idx].clone();
                        env.ledger().with_mut(|li| li.timestamp = now + 200);
                        let _ = streaming::claim_stream(&env, &recipient, id);
                    }
                }
                9 => {
                    if !streams.is_empty() {
                        let idx = (rng as usize) % streams.len();
                        let (id, _) = streams[idx];
                        let _ = streaming::cancel_stream(&env, &admin, id);
                    }
                }
                10 => {
                    if let Ok(id) = timelock::create_proposal(
                        &env,
                        &current_admin,
                        ActionType::FeeChange,
                        Bytes::from_slice(&env, &[1, 2, 3, 4, 5, 6, 7, 8]),
                        now + 10,
                        now + 40,
                        now + 80,
                    ) {
                        proposals.push(id);
                    }
                }
                11 => {
                    if !proposals.is_empty() {
                        let id = proposals[(rng as usize) % proposals.len()];
                        env.ledger().with_mut(|li| li.timestamp = now + 20);
                        let _ = timelock::vote_proposal(
                            &env,
                            &Address::generate(&env),
                            id,
                            VoteChoice::For,
                        );
                    }
                }
                12 => {
                    if !proposals.is_empty() {
                        let id = proposals[(rng as usize) % proposals.len()];
                        env.ledger().with_mut(|li| li.timestamp = now + 60);
                        let _ = timelock::queue_proposal(&env, id);
                    }
                }
                _ => {
                    if !proposals.is_empty() {
                        let id = proposals[(rng as usize) % proposals.len()];
                        env.ledger().with_mut(|li| li.timestamp = now + 100);
                        let _ = timelock::execute_proposal(&env, id);
                    }
                }
            }
        }

        let replay = replay_from_env(&env);
        assert_replay_matches_contract(&env, &client, &replay);
    }
}

#[test]
fn failed_token_tx_emits_no_partial_success_event() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin, _treasury) = setup_factory(&env);
    let before_len = env.events().all().len();
    let before_fee_events = count_topic(&env, symbol_short!("fee_up_v1"));

    let unauthorized = Address::generate(&env);
    let result = client.try_update_fees(&unauthorized, &Some(200_000_000), &None);
    assert!(result.is_err());

    assert_eq!(env.events().all().len(), before_len);
    assert_eq!(count_topic(&env, symbol_short!("fee_up_v1")), before_fee_events);

    let state = client.get_state();
    assert_eq!(state.admin, admin);
}

#[test]
fn failed_stream_tx_emits_no_partial_success_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (client, admin, _treasury) = setup_factory(&env);
    client
        .create_token(
            &admin,
            &String::from_str(&env, "StreamToken"),
            &String::from_str(&env, "STRM"),
            &7,
            &1_000_000_000,
            &None,
            &100_000_000,
        );

    let recipient = Address::generate(&env);
    let stream_id = streaming::create_stream(
        &env,
        &admin,
        &StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 300_000_000,
            start_time: 1_000,
            end_time: 2_000,
            cliff_time: 1_500,
        },
    )
    .unwrap();

    let before_len = env.events().all().len();
    let before_claim_events = count_topic(&env, symbol_short!("strm_clm"));

    env.ledger().with_mut(|li| li.timestamp = 1_200);
    let result = streaming::claim_stream(&env, &recipient, stream_id);
    assert!(result.is_err());

    assert_eq!(env.events().all().len(), before_len);
    assert_eq!(count_topic(&env, symbol_short!("strm_clm")), before_claim_events);
}

#[test]
fn failed_governance_tx_emits_no_partial_success_event() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000);

    let (_client, admin, _treasury) = setup_factory(&env);
    governance::initialize_governance(&env, Some(30), Some(51)).unwrap();

    let proposal_id = timelock::create_proposal(
        &env,
        &admin,
        ActionType::PauseContract,
        Bytes::new(&env),
        1_100,
        1_200,
        1_300,
    )
    .unwrap();

    let before_len = env.events().all().len();
    let before_vote_events = count_topic(&env, symbol_short!("vote_csv1"));

    env.ledger().with_mut(|li| li.timestamp = 1_050);
    let result = timelock::vote_proposal(&env, &Address::generate(&env), proposal_id, VoteChoice::For);
    assert!(result.is_err());

    assert_eq!(env.events().all().len(), before_len);
    assert_eq!(count_topic(&env, symbol_short!("vote_csv1")), before_vote_events);
}
