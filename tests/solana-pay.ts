import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import { SolanaPay } from '../target/types/solana_pay';
import { PublicKey, SystemProgram, Transaction, Connection, Commitment } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
import { assert } from "chai";

describe('anchor-escrow', () => {
  const commitment: Commitment = 'processed';
  // const connection = new Connection('https://rpc-mainnet-fork.epochs.studio', { commitment, wsEndpoint: 'wss://rpc-mainnet-fork.epochs.studio/ws' });
  // const options = anchor.Provider.defaultOptions();
  // const wallet = NodeWallet.local();
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);

  const program = anchor.workspace.AnchorEscrow as Program<SolanaPay>;

  let mintA = null as Token;
  let mintB = null as Token;
  let merchantTokenAccountA = null;
  let merchantTokenAccountB = null;
  let takerTokenAccountA = null;
  let takerTokenAccountB = null;
  let vault_account_pda = null;
  let vault_account_bump = null;
  let vault_authority_pda = null;

  const takerAmount = 1000;
  const merchantAmount = 500;

  const escrowAccount = anchor.web3.Keypair.generate();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const merchantMainAccount = anchor.web3.Keypair.generate();
  const takerMainAccount = anchor.web3.Keypair.generate();

  it("Initialize program state", async () => {
    // Airdropping tokens to a payer.
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 1000000000),
      "processed"
    );

    // Fund Main Accounts
    await provider.sendAndConfirm(
      (() => {
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: merchantMainAccount.publicKey,
            lamports: 100000000,
          }),
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: takerMainAccount.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [payer]
    );

    mintA = await createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      0
      // TOKEN_PROGRAM_ID
    );

    mintB = await createMint(
      provider.connection,
      payer,
      mintAuthority.publicKey,
      null,
      0
      // TOKEN_PROGRAM_ID
    );

    merchantTokenAccountA = await mintA.createAccount(merchantMainAccount.publicKey);
    takerTokenAccountA = await mintA.createAccount(takerMainAccount.publicKey);

    merchantTokenAccountB = await mintB.createAccount(merchantMainAccount.publicKey);
    takerTokenAccountB = await mintB.createAccount(takerMainAccount.publicKey);

    await mintA.mintTo(
      merchantTokenAccountA,
      mintAuthority.publicKey,
      [mintAuthority],
      merchantAmount
    );

    await mintB.mintTo(
      takerTokenAccountB,
      mintAuthority.publicKey,
      [mintAuthority],
      takerAmount
    );

    let _merchantTokenAccountA = await mintA.getAccountInfo(merchantTokenAccountA);
    let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);

    assert.ok(_merchantTokenAccountA.amount.toNumber() == merchantAmount);
    assert.ok(_takerTokenAccountB.amount.toNumber() == takerAmount);
  });

  it("Initialize escrow", async () => {
    const [_vault_account_pda, _vault_account_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token-seed"))],
      program.programId
    );
    vault_account_pda = _vault_account_pda;
    vault_account_bump = _vault_account_bump;

    const [_vault_authority_pda, _vault_authority_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))],
      program.programId
    );
    vault_authority_pda = _vault_authority_pda;

    await program.rpc.initialize(
      vault_account_bump,
      new anchor.BN(merchantAmount),
      new anchor.BN(takerAmount),
      {
        accounts: {
          merchant: merchantMainAccount.publicKey,
          vaultAccount: vault_account_pda,
          mint: mintA.publicKey,
          merchantDepositTokenAccount: merchantTokenAccountA,
          merchantReceiveTokenAccount: merchantTokenAccountB,
          escrowAccount: escrowAccount.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [
          await program.account.escrowAccount.createInstruction(escrowAccount),
        ],
        signers: [escrowAccount, merchantMainAccount],
      }
    );

    let _vault = await mintA.getAccountInfo(vault_account_pda);

    let _escrowAccount = await program.account.escrowAccount.fetch(
      escrowAccount.publicKey
    );

    // Check that the new owner is the PDA.
    assert.ok(_vault.owner.equals(vault_authority_pda));

    // Check that the values in the escrow account match what we expect.
    assert.ok(_escrowAccount.merchantKey.equals(merchantMainAccount.publicKey));
    assert.ok(_escrowAccount.merchantAmount.toNumber() == merchantAmount);
    assert.ok(_escrowAccount.buyerAmount.toNumber() == takerAmount);
    assert.ok(
      _escrowAccount.merchantDepositTokenAccount.equals(merchantTokenAccountA)
    );
    assert.ok(
      _escrowAccount.merchantReceiveTokenAccount.equals(merchantTokenAccountB)
    );
  });

  it("Exchange escrow state", async () => {
    await program.rpc.exchange({
      accounts: {
        buyer: takerMainAccount.publicKey,
        buyerDepositTokenAccount: takerTokenAccountB,
        buyerReceiveTokenAccount: takerTokenAccountA,
        merchantDepositTokenAccount: merchantTokenAccountA,
        merchantReceiveTokenAccount: merchantTokenAccountB,
        merchant: merchantMainAccount.publicKey,
        escrowAccount: escrowAccount.publicKey,
        vaultAccount: vault_account_pda,
        vaultAuthority: vault_authority_pda,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [takerMainAccount]
    });

    let _takerTokenAccountA = await mintA.getAccountInfo(takerTokenAccountA);
    let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);
    let _merchantTokenAccountA = await mintA.getAccountInfo(merchantTokenAccountA);
    let _merchantTokenAccountB = await mintB.getAccountInfo(merchantTokenAccountB);

    assert.ok(_takerTokenAccountA.amount.toNumber() == merchantAmount);
    assert.ok(_merchantTokenAccountA.amount.toNumber() == 0);
    assert.ok(_merchantTokenAccountB.amount.toNumber() == takerAmount);
    assert.ok(_takerTokenAccountB.amount.toNumber() == 0);
  });

  it("Initialize escrow and cancel escrow", async () => {
    // Put back tokens into merchant token A account.
    await mintA.mintTo(
      merchantTokenAccountA,
      mintAuthority.publicKey,
      [mintAuthority],
      merchantAmount
    );

    await program.rpc.initialize(
      vault_account_bump,
      new anchor.BN(merchantAmount),
      new anchor.BN(takerAmount),
      {
        accounts: {
          merchant: merchantMainAccount.publicKey,
          vaultAccount: vault_account_pda,
          mint: mintA.publicKey,
          merchantDepositTokenAccount: merchantTokenAccountA,
          merchantReceiveTokenAccount: merchantTokenAccountB,
          escrowAccount: escrowAccount.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [
          await program.account.escrowAccount.createInstruction(escrowAccount),
        ],
        signers: [escrowAccount, merchantMainAccount],
      }
    );

    // Cancel the escrow.
    await program.rpc.cancel({
      accounts: {
        merchant: merchantMainAccount.publicKey,
        merchantDepositTokenAccount: merchantTokenAccountA,
        vaultAccount: vault_account_pda,
        vaultAuthority: vault_authority_pda,
        escrowAccount: escrowAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [merchantMainAccount]
    });

    // Check the final owner should be the provider public key.
    const _merchantTokenAccountA = await mintA.getAccountInfo(merchantTokenAccountA);
    assert.ok(_merchantTokenAccountA.owner.equals(merchantMainAccount.publicKey));

    // Check all the funds are still there.
    assert.ok(_merchantTokenAccountA.amount.toNumber() == merchantAmount);
  });
});
