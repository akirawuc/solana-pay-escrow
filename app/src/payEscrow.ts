import {PublicKey, Signer} from "@solana/web3.js";
import {BN, Program, utils, web3} from "@project-serum/anchor";
import {SolanaPay} from "./IDL/solana_pay";
import {getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID} from "@solana/spl-token";

export interface InitializeReq{
    merchant:Signer
    token:PublicKey
    amount:bigint
}

export async function initialize(
    program:Program<SolanaPay>,req:InitializeReq
){
    const {merchant,token,amount}=req

    const merchantATA=await getOrCreateAssociatedTokenAccount(
        program.provider.connection,merchant,token,merchant.publicKey
    )

    const [vault_account_pda, vault_account_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('token_seed'))],
            program.programId
        );

    const [escrow_account_pda, escrow_account_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('escrow'))],
            program.programId
        );
    const [vault_authority_pda, _vault_authority_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('vault_auth'))],
            program.programId
        );

    const tx = await program.methods
        .initialize(new BN(1000))
        .accounts({
            merchant: merchant.publicKey,
            mint: token,
            vaultAccount: vault_account_pda,
            vaultAuthority: vault_authority_pda,
            merchantReceiveTokenAccount: merchantATA.address,
            escrowAccount: escrow_account_pda,
            systemProgram: web3.SystemProgram.programId,
            rent: web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([merchant])
        .rpc({commitment: "confirmed"});

    console.log(`[INFO] Showing the logs:${tx}`);
    return tx
}

export interface ExchangeReq{
    payer:Signer
    merchant:PublicKey
    token:PublicKey
}

export async function exchange(
    program:Program<SolanaPay>,req:ExchangeReq
){
    const {payer,merchant,token}=req

    const payerATA=await getOrCreateAssociatedTokenAccount(
        program.provider.connection,payer,token,payer.publicKey
    )

    const merchantATA=await getAssociatedTokenAddress(
        token,merchant
    )

    const [vault_account_pda, vault_account_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('token_seed'))],
            program.programId
        );

    const [escrow_account_pda, escrow_account_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('escrow'))],
            program.programId
        );
    const [vault_authority_pda, _vault_authority_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('vault_auth'))],
            program.programId
        );

    const tx = await program.methods
        .exchange()
        .accounts({
            buyer: payer.publicKey,
            buyerDepositTokenAccount: payerATA.address,
            merchantReceiveTokenAccount: merchantATA,
            merchant: merchant,
            escrowAccount: escrow_account_pda,
            vaultAccount: vault_account_pda,
            vaultAuthority: vault_authority_pda,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([payer])
        .rpc({commitment: "confirmed"});

    console.log(`[INFO] Showing the logs:${tx}`);
    return tx
}



export async function cancel(
    program:Program<SolanaPay>,merchant:Signer
){
    const [vault_account_pda, vault_account_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('token_seed'))],
            program.programId
        );

    const [escrow_account_pda, escrow_account_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('escrow'))],
            program.programId
        );
    const [vault_authority_pda, _vault_authority_bump] =
        await PublicKey.findProgramAddress(
            [Buffer.from(utils.bytes.utf8.encode('vault_auth'))],
            program.programId
        );

    const tx = await program.methods
        .cancel()
        .accounts({
            merchant: merchant.publicKey,
            vaultAccount: vault_account_pda,
            vaultAuthority: vault_authority_pda,
            escrowAccount: escrow_account_pda,
            tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([merchant])
        .rpc({commitment: "confirmed"});

    console.log(`[INFO] Showing the logs:${tx}`);
    return tx
}
