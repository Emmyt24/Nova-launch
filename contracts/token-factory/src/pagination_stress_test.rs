/// pagination_stress_test.rs
///
/// Validates contract behaviour under high-volume storage growth and deep
/// pagination.  Three test groups:
///
///   1. Volume growth    — large token/stream datasets, exact count checks
///   2. Pagination walk  — full cursor traversal, no duplicates, no gaps
///   3. Boundary         — cursor past end, limit=0/1/50, single-entry corpus

extern crate std;

#[cfg(test)]
mod pagination_stress_test {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    // ── helpers ──────────────────────────────────────────────────────────

    /// Deploy and initialise the contract. Returns (env, contract_id, admin).
    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, crate::TokenFactory);
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let admin    = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_i128, &50_i128);

        (env, contract_id, admin)
    }

    /// Create `count` tokens all owned by `creator` and return the expected
    /// token indices (0..count as u32).
    fn create_tokens(
        env: &Env,
        contract_id: &Address,
        creator: &Address,
        count: u32,
    ) -> std::vec::Vec<u32> {
        let client = crate::TokenFactoryClient::new(env, contract_id);
        let mut indices = std::vec::Vec::new();

        for i in 0..count {
            let name   = soroban_sdk::String::from_str(env, "StressToken");
            let symbol = soroban_sdk::String::from_str(env, "STR");

            let index_before = client.get_token_count();
            client.create_token(
                creator,
                &name,
                &symbol,
                &6_u32,
                &1_000_000_i128,
                &None,
                &100_i128,
            );
            // The contract assigns indices sequentially from 0
            indices.push(index_before);
            let _ = i;
        }

        indices
    }

    /// Collect every token index for a beneficiary by walking all pages.
    fn collect_all_pages(
        env: &Env,
        contract_id: &Address,
        beneficiary: &Address,
        page_size: u32,
    ) -> std::vec::Vec<u32> {
        let client = crate::TokenFactoryClient::new(env, contract_id);
        let mut all: std::vec::Vec<u32> = std::vec::Vec::new();
        let mut cursor = 0_u32;

        loop {
            let page = client.get_streams_by_beneficiary(beneficiary, cursor, page_size);

            for idx in page.token_indices.iter() {
                all.push(idx);
            }

            match page.next_cursor {
                Some(next) => cursor = next,
                None       => break,
            }
        }

        all
    }

    // ════════════════════════════════════════════════════════════════════
    // 1. Volume Growth
    // ════════════════════════════════════════════════════════════════════

    /// 50 tokens — stream count matches, no data loss.
    #[test]
    fn volume_50_tokens_exact_stream_count() {
        let (env, contract_id, admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 50);

        let count = crate::storage::get_beneficiary_stream_count(&env, &beneficiary);
        assert_eq!(count, 50, "stream count must be exactly 50");
    }

    /// 100 tokens — stream count matches.
    #[test]
    fn volume_100_tokens_exact_stream_count() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 100);

        let count = crate::storage::get_beneficiary_stream_count(&env, &beneficiary);
        assert_eq!(count, 100, "stream count must be exactly 100");
    }

    /// 200 tokens — stream count matches.
    #[test]
    fn volume_200_tokens_exact_stream_count() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 200);

        let count = crate::storage::get_beneficiary_stream_count(&env, &beneficiary);
        assert_eq!(count, 200, "stream count must be exactly 200");
    }

    /// Two beneficiaries with different volumes do not interfere with each other.
    #[test]
    fn volume_two_beneficiaries_isolated() {
        let (env, contract_id, _admin) = setup();

        let beneficiary_a = Address::generate(&env);
        let beneficiary_b = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary_a, 60);
        create_tokens(&env, &contract_id, &beneficiary_b, 40);

        let count_a = crate::storage::get_beneficiary_stream_count(&env, &beneficiary_a);
        let count_b = crate::storage::get_beneficiary_stream_count(&env, &beneficiary_b);

        assert_eq!(count_a, 60, "beneficiary_a must have exactly 60 streams");
        assert_eq!(count_b, 40, "beneficiary_b must have exactly 40 streams");
    }

    /// Global token count grows correctly across multiple beneficiaries.
    #[test]
    fn volume_global_token_count_monotonic() {
        let (env, contract_id, _admin) = setup();

        let b1 = Address::generate(&env);
        let b2 = Address::generate(&env);
        let b3 = Address::generate(&env);

        create_tokens(&env, &contract_id, &b1, 30);
        create_tokens(&env, &contract_id, &b2, 30);
        create_tokens(&env, &contract_id, &b3, 30);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        assert_eq!(client.get_token_count(), 90, "global token count must be 90");
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. Pagination Walk — no duplicates, no gaps, deterministic ordering
    // ════════════════════════════════════════════════════════════════════

    /// Walk all pages with limit=10 over 100 tokens.
    /// Every index must appear exactly once, in ascending order.
    #[test]
    fn pagination_walk_100_tokens_limit_10_no_duplicates_no_gaps() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        let expected = create_tokens(&env, &contract_id, &beneficiary, 100);
        let collected = collect_all_pages(&env, &contract_id, &beneficiary, 10);

        assert_eq!(
            collected.len(),
            100,
            "must collect exactly 100 indices across all pages"
        );

        // No duplicates
        let mut seen = std::collections::HashSet::new();
        for &idx in &collected {
            assert!(seen.insert(idx), "duplicate index {} found", idx);
        }

        // Matches expected set
        for &idx in &expected {
            assert!(seen.contains(&idx), "index {} is missing from pages", idx);
        }

        // Ascending order
        for window in collected.windows(2) {
            assert!(
                window[0] < window[1],
                "indices must be in ascending order: {} >= {}",
                window[0],
                window[1]
            );
        }
    }

    /// Walk all pages with limit=50 (max cap) over 200 tokens.
    #[test]
    fn pagination_walk_200_tokens_limit_50_complete() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 200);
        let collected = collect_all_pages(&env, &contract_id, &beneficiary, 50);

        assert_eq!(collected.len(), 200, "must collect all 200 indices");

        let mut seen = std::collections::HashSet::new();
        for &idx in &collected {
            assert!(seen.insert(idx), "duplicate index {} found", idx);
        }
    }

    /// Walk with limit=1 (single-item pages) over 20 tokens.
    #[test]
    fn pagination_walk_20_tokens_limit_1_single_item_pages() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 20);
        let collected = collect_all_pages(&env, &contract_id, &beneficiary, 1);

        assert_eq!(collected.len(), 20, "must collect all 20 indices one by one");

        // Each page must have returned exactly 1 item — verified indirectly
        // by confirming we collected the right total with no duplicates.
        let mut seen = std::collections::HashSet::new();
        for &idx in &collected {
            assert!(seen.insert(idx), "duplicate index {} found", idx);
        }
    }

    /// Limit values larger than 50 are capped at 50 — a single page of 50
    /// items is returned even if limit=1000 is requested.
    #[test]
    fn pagination_limit_capped_at_50() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 80);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let page = client.get_streams_by_beneficiary(&beneficiary, 0, 1000);

        assert_eq!(
            page.token_indices.len(),
            50,
            "page size must be capped at 50 regardless of requested limit"
        );
        assert!(
            page.next_cursor.is_some(),
            "next_cursor must be Some when more items remain after cap"
        );
    }

    /// Resuming from next_cursor yields a consistent continuation with no overlap.
    #[test]
    fn pagination_resume_from_cursor_no_overlap() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 75);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let page1 = client.get_streams_by_beneficiary(&beneficiary, 0, 50);
        assert_eq!(page1.token_indices.len(), 50);
        let cursor2 = page1.next_cursor.expect("must have next page");

        let page2 = client.get_streams_by_beneficiary(&beneficiary, cursor2, 50);
        assert_eq!(page2.token_indices.len(), 25, "second page must have remaining 25");
        assert!(page2.next_cursor.is_none(), "no further pages after last item");

        // No overlap between pages
        let set1: std::collections::HashSet<u32> = page1.token_indices.iter().collect();
        for idx in page2.token_indices.iter() {
            assert!(!set1.contains(&idx), "overlap: index {} appears in both pages", idx);
        }
    }

    /// Deep cursor offset — start at cursor=90 over a 100-item corpus.
    #[test]
    fn pagination_deep_cursor_offset_returns_tail() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 100);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let page = client.get_streams_by_beneficiary(&beneficiary, 90, 50);

        assert_eq!(
            page.token_indices.len(),
            10,
            "cursor=90 over 100 items must return exactly 10"
        );
        assert!(page.next_cursor.is_none(), "no further pages after tail");
    }

    // ════════════════════════════════════════════════════════════════════
    // 3. Boundary Conditions
    // ════════════════════════════════════════════════════════════════════

    /// cursor=0, limit=0 — must return empty page, no panic.
    #[test]
    fn boundary_limit_zero_returns_empty() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 10);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let page = client.get_streams_by_beneficiary(&beneficiary, 0, 0);

        assert_eq!(page.token_indices.len(), 0, "limit=0 must return empty page");
    }

    /// cursor=total — exactly at the end, must return empty page.
    #[test]
    fn boundary_cursor_equals_total_returns_empty() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 30);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        // cursor == total == 30 means no entries remain
        let page = client.get_streams_by_beneficiary(&beneficiary, 30, 10);

        assert_eq!(
            page.token_indices.len(),
            0,
            "cursor at total must return empty page"
        );
        assert!(
            page.next_cursor.is_none(),
            "next_cursor must be None when cursor == total"
        );
    }

    /// cursor past end — must return empty page, no panic.
    #[test]
    fn boundary_cursor_past_end_returns_empty() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 20);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        let page = client.get_streams_by_beneficiary(&beneficiary, 9999, 10);

        assert_eq!(
            page.token_indices.len(),
            0,
            "cursor past end must return empty page"
        );
        assert!(
            page.next_cursor.is_none(),
            "next_cursor must be None when cursor is past end"
        );
    }

    /// Beneficiary with zero streams — all queries return empty.
    #[test]
    fn boundary_zero_streams_all_queries_empty() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        for cursor in [0_u32, 1, 50, 9999] {
            for limit in [0_u32, 1, 10, 50] {
                let page = client.get_streams_by_beneficiary(&beneficiary, cursor, limit);
                assert_eq!(
                    page.token_indices.len(),
                    0,
                    "empty corpus must always return empty page (cursor={}, limit={})",
                    cursor,
                    limit
                );
                assert!(
                    page.next_cursor.is_none(),
                    "next_cursor must be None for empty corpus"
                );
            }
        }
    }

    /// Single-entry corpus — first page returns it, second page is empty.
    #[test]
    fn boundary_single_entry_corpus() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 1);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let page1 = client.get_streams_by_beneficiary(&beneficiary, 0, 10);
        assert_eq!(page1.token_indices.len(), 1, "must return the single entry");
        assert!(page1.next_cursor.is_none(), "no next page for single-entry corpus");

        // Second query past the only entry
        let page2 = client.get_streams_by_beneficiary(&beneficiary, 1, 10);
        assert_eq!(page2.token_indices.len(), 0, "cursor=1 on single-entry corpus is past end");
        assert!(page2.next_cursor.is_none());
    }

    /// Last page is partial — final page has fewer items than limit.
    #[test]
    fn boundary_last_page_is_partial() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        // 55 tokens, page size 50 → first page full, second page has 5
        create_tokens(&env, &contract_id, &beneficiary, 55);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let page1 = client.get_streams_by_beneficiary(&beneficiary, 0, 50);
        assert_eq!(page1.token_indices.len(), 50);
        let cursor2 = page1.next_cursor.expect("must have second page");

        let page2 = client.get_streams_by_beneficiary(&beneficiary, cursor2, 50);
        assert_eq!(page2.token_indices.len(), 5, "last page must be partial (5 items)");
        assert!(page2.next_cursor.is_none(), "no page after partial last page");
    }

    /// Cursor=total-1 — last valid cursor returns exactly one item.
    #[test]
    fn boundary_cursor_at_last_valid_entry() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 25);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);
        // last valid entry index is 24 (total=25, 0-indexed)
        let page = client.get_streams_by_beneficiary(&beneficiary, 24, 10);

        assert_eq!(
            page.token_indices.len(),
            1,
            "cursor at last entry must return exactly one item"
        );
        assert!(page.next_cursor.is_none(), "no next page after last entry");
    }

    /// Deterministic ordering — same query returns identical results on repeat calls.
    #[test]
    fn boundary_deterministic_ordering_repeated_query() {
        let (env, contract_id, _admin) = setup();
        let beneficiary = Address::generate(&env);

        create_tokens(&env, &contract_id, &beneficiary, 40);

        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let page_a = client.get_streams_by_beneficiary(&beneficiary, 0, 20);
        let page_b = client.get_streams_by_beneficiary(&beneficiary, 0, 20);

        let indices_a: std::vec::Vec<u32> = page_a.token_indices.iter().collect();
        let indices_b: std::vec::Vec<u32> = page_b.token_indices.iter().collect();

        assert_eq!(
            indices_a, indices_b,
            "repeated identical query must return identical ordered results"
        );
    }
}