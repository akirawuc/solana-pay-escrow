use std::mem::size_of;
use anchor_lang::prelude::*;
use solana_program::clock::Clock;
use anchor_spl::token::{self, CloseAccount, Mint, SetAuthority, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("AqGtQmx76GZcDeo3NCXeaVaa88ZFZLyWivRKQbDhfHuE");

#[program]
pub mod solana_pay {
    use super::*;

    // const ESCROW_PDA_SEED: &[u8] = b"escrow";
    const VAULT_AUTH_PDA_SEED: &[u8] = b"vault_auth";

    pub fn initialize(
        ctx: Context<Initialize>,
        // _vault_account_bump: u8,
        buyer_amount: u64,
    ) -> Result<()> {
        ctx.accounts.escrow_account.merchant_key = *ctx.accounts.merchant.key;

        ctx.accounts
            .escrow_account
            .merchant_receive_token_account = *ctx
            .accounts
            .merchant_receive_token_account
            .to_account_info()
            .key;

        ctx.accounts.escrow_account.buyer_amount = buyer_amount;
        let clock = Clock::get()?;
        ctx.accounts.escrow_account.create_time = clock.unix_timestamp; 
        ctx.accounts.escrow_account.end_time = clock.unix_timestamp + 300; 

        let (vault_authority, _vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTH_PDA_SEED], ctx.program_id);

        token::set_authority(
            ctx.accounts.into_set_authority_context(),
            AuthorityType::AccountOwner,
            Some(vault_authority),
        )?;

        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTH_PDA_SEED], ctx.program_id);
        let authority_seeds = &[&VAULT_AUTH_PDA_SEED[..], &[vault_authority_bump]];

        token::close_account(
            ctx.accounts
                .into_close_context()
                .with_signer(&[&authority_seeds[..]]),
        )?;

        Ok(())
    }

    pub fn exchange(ctx: Context<Exchange>) -> Result<()> {

        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[VAULT_AUTH_PDA_SEED], ctx.program_id);

        let authority_seeds = &[&VAULT_AUTH_PDA_SEED[..], &[vault_authority_bump]];

        let clock = Clock::get()?;

        let time_now = clock.unix_timestamp;

        if check_valid_time(
            ctx.accounts.escrow_account.end_time, 
            time_now
            ) {
        token::transfer(
            ctx.accounts.into_transfer_to_vault_context(),
            ctx.accounts.escrow_account.buyer_amount,
        )?;
        token::transfer(
            ctx.accounts.into_transfer_to_merchant_context().with_signer(&[&authority_seeds[..]]),
            ctx.accounts.escrow_account.buyer_amount,
        )?;

        token::close_account(
            ctx.accounts
                .into_close_context()
                .with_signer(&[&authority_seeds[..]]),
        )?;

        } else {

        token::close_account(
            ctx.accounts
                .into_close_context()
                .with_signer(&[&authority_seeds[..]]),
        )?;

        }
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction()]
pub struct Initialize<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub merchant: AccountInfo<'info>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        seeds = [b"token_seed".as_ref()],
        bump,
        payer = merchant,
        token::authority = merchant,
        token::mint = mint,
    )]
    pub vault_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        seeds = [b"vault_auth".as_ref()],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,
    pub merchant_receive_token_account: Box<Account<'info, TokenAccount>>,
    /// change to pda, like the vault account above.
    #[account(
        init,
        seeds = [b"escrow".as_ref()],
        bump,
        payer = merchant,
        space = size_of::<EscrowAccount>() + 40
    )]
    pub escrow_account: Box<Account<'info, EscrowAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut, signer)]
    pub merchant: AccountInfo<'info>,
    #[account(mut)]
    pub vault_account: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub vault_authority: AccountInfo<'info>,
    #[account(
        mut,
        constraint = escrow_account.merchant_key == *merchant.key,
        close = merchant
    )]
    pub escrow_account: Box<Account<'info, EscrowAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Exchange<'info> {
    #[account(signer)]
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub buyer: AccountInfo<'info>,
    #[account(mut)]
    pub buyer_deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub merchant_receive_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub merchant: AccountInfo<'info>,
    #[account(
        mut,
        constraint = escrow_account.buyer_amount <= buyer_deposit_token_account.amount,
        constraint = escrow_account.merchant_receive_token_account == *merchant_receive_token_account.to_account_info().key,
        constraint = escrow_account.merchant_key == *merchant.key,
        close = merchant
    )]
    pub escrow_account: Box<Account<'info, EscrowAccount>>,
    #[account(mut)]
    pub vault_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub vault_authority: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_program: AccountInfo<'info>,
}

#[account]
pub struct EscrowAccount {
    pub merchant_key: Pubkey,
    pub merchant_receive_token_account: Pubkey,
    pub payment_authority: Pubkey,
    pub buyer_amount: u64,
    pub create_time: i64,
    pub end_time: i64

}

impl<'info> Initialize<'info> {

    fn into_set_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.vault_account.to_account_info().clone(),
            current_authority: self.merchant.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Cancel<'info> {

    fn into_close_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        let cpi_accounts = CloseAccount {
            account: self.vault_account.to_account_info().clone(),
            destination: self.merchant.clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
}

impl<'info> Exchange<'info> {
    fn into_transfer_to_vault_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.buyer_deposit_token_account.to_account_info().clone(),
            to: self
                .vault_account
                .to_account_info()
                .clone(),
            authority: self.buyer.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }
    fn into_transfer_to_merchant_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault_account.to_account_info().clone(),
            to: self
                .merchant_receive_token_account
                .to_account_info()
                .clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }


    fn into_close_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        let cpi_accounts = CloseAccount {
            account: self.vault_account.to_account_info().clone(),
            destination: self.merchant.clone(),
            authority: self.vault_authority.clone(),
        };
        CpiContext::new(self.token_program.clone(), cpi_accounts)
    }

}

pub fn check_valid_time(end_time: i64, current_ts: i64) -> bool {
    if current_ts <= end_time{
        return true;
    }
    false
}
