use soroban_sdk::{contracttype, Map, String};

#[contracttype]
#[derive(Debug, Clone)]
pub struct DifferentialVestingSchedule {
    pub total_amount: i128,
    pub start_time: u64,
    pub cliff_duration: u64,
    pub vesting_duration: u64,
    pub claimed_amount: i128,
}

impl DifferentialVestingSchedule {
    pub fn calculate_vested(&self, current_time: u64) -> Result<i128, &'static str> {
        if current_time < self.start_time {
            return Ok(0);
        }
        let elapsed = current_time.saturating_sub(self.start_time);
        if elapsed < self.cliff_duration {
            return Ok(0);
        }
        if elapsed >= self.vesting_duration {
            return Ok(self.total_amount);
        }
        (self.total_amount as u128)
            .checked_mul(elapsed as u128)
            .and_then(|v| v.checked_div(self.vesting_duration as u128))
            .and_then(|v| i128::try_from(v).ok())
            .ok_or("Overflow")
    }

    pub fn calculate_claimable(&self, current_time: u64) -> Result<i128, &'static str> {
        self.calculate_vested(current_time)?
            .checked_sub(self.claimed_amount)
            .ok_or("Underflow")
    }
}

#[contracttype]
pub struct DifferentialEngine {
    pub schedules: Map<u32, DifferentialVestingSchedule>,
}

impl DifferentialEngine {
    pub fn new(env: &soroban_sdk::Env) -> Self {
        Self {
            schedules: Map::new(env),
        }
    }

    pub fn add_schedule(
        &mut self,
        id: u32,
        total_amount: i128,
        start_time: u64,
        cliff_duration: u64,
        vesting_duration: u64,
    ) {
        self.schedules.set(
            id,
            DifferentialVestingSchedule {
                total_amount,
                start_time,
                cliff_duration,
                vesting_duration,
                claimed_amount: 0,
            },
        );
    }

    pub fn get_vested(&self, id: u32, current_time: u64) -> Result<i128, &'static str> {
        self.schedules
            .get(id)
            .ok_or("Not found")?
            .calculate_vested(current_time)
    }

    pub fn get_claimable(&self, id: u32, current_time: u64) -> Result<i128, &'static str> {
        self.schedules
            .get(id)
            .ok_or("Not found")?
            .calculate_claimable(current_time)
    }

    pub fn claim(&mut self, id: u32, current_time: u64) -> Result<i128, &'static str> {
        let mut schedule = self.schedules.get(id).ok_or("Not found")?;
        let claimable = schedule.calculate_claimable(current_time)?;
        if claimable == 0 {
            return Err("Nothing to claim");
        }
        schedule.claimed_amount = schedule
            .claimed_amount
            .checked_add(claimable)
            .ok_or("Overflow")?;
        self.schedules.set(id, schedule);
        Ok(claimable)
    }
}

#[contracttype]
pub struct SupplyTracker {
    pub total_supply: i128,
    pub total_minted: i128,
    pub total_burned: i128,
    pub balances: Map<String, i128>,
}

impl SupplyTracker {
    pub fn new(env: &soroban_sdk::Env, initial: i128) -> Self {
        Self {
            total_supply: initial,
            total_minted: initial,
            total_burned: 0,
            balances: Map::new(env),
        }
    }

    pub fn mint(&mut self, to: String, amount: i128) -> Result<(), &'static str> {
        self.total_supply = self.total_supply.checked_add(amount).ok_or("Overflow")?;
        self.total_minted = self.total_minted.checked_add(amount).ok_or("Overflow")?;
        let current_bal = self.balances.get(to.clone()).unwrap_or(0);
        self.balances
            .set(to, current_bal.checked_add(amount).ok_or("Overflow")?);
        Ok(())
    }

    pub fn burn(&mut self, from: String, amount: i128) -> Result<(), &'static str> {
        let balance = self.balances.get(from.clone()).unwrap_or(0);
        if balance < amount {
            return Err("Insufficient");
        }
        self.balances
            .set(from, balance.checked_sub(amount).ok_or("Underflow")?);
        self.total_supply = self.total_supply.checked_sub(amount).ok_or("Underflow")?;
        self.total_burned = self.total_burned.checked_add(amount).ok_or("Overflow")?;
        Ok(())
    }

    pub fn verify(&self) -> Result<(), &'static str> {
        let calc = self
            .total_minted
            .checked_sub(self.total_burned)
            .ok_or("Underflow")?;
        if calc != self.total_supply {
            return Err("Supply mismatch");
        }
        let mut sum: i128 = 0;
        for item in self.balances.iter() {
            sum = sum.checked_add(item.1).ok_or("Overflow during sum")?;
        }
        if sum != self.total_supply {
            return Err("Balance sum mismatch");
        }
        Ok(())
    }
}
