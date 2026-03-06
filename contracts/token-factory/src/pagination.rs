use soroban_sdk::{Address, Env, Vec};

use crate::storage;
use crate::types::{Error, PaginatedTokens};

const MAX_PAGE_SIZE: u32 = 100;
const DEFAULT_PAGE_SIZE: u32 = 20;

pub fn get_tokens_by_creator(
    env: &Env,
    creator: &Address,
    cursor: Option<u32>,
    limit: Option<u32>,
) -> Result<PaginatedTokens, Error> {
    let page_size = limit
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .min(MAX_PAGE_SIZE)
        .max(1);

    let creator_tokens = storage::get_creator_tokens(env, creator);
    let start_pos = cursor.unwrap_or(0);

    if start_pos >= creator_tokens.len() {
        return Ok(PaginatedTokens {
            tokens: Vec::new(env),
            cursor: None,
        });
    }

    let mut tokens = Vec::new(env);
    let mut count = 0_u32;
    let mut current_pos = start_pos;

    while count < page_size && current_pos < creator_tokens.len() {
        let token_index = creator_tokens.get(current_pos).unwrap();
        if let Some(token_info) = storage::get_token_info(env, token_index) {
            tokens.push_back(token_info);
            count += 1;
        }
        current_pos += 1;
    }

    let next_cursor = if current_pos < creator_tokens.len() {
        Some(current_pos)
    } else {
        None
    };

    Ok(PaginatedTokens {
        tokens,
        cursor: next_cursor,
    })
}

pub fn get_creator_token_count(env: &Env, creator: &Address) -> u32 {
    storage::get_creator_token_count(env, creator)
}
