import * as anchor from '@project-serum/anchor';
import { Program, Wallet } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import { SolanaPay } from '../target/types/solana_pay';
import { PublicKey, SystemProgram, Transaction, Connection, Commitment, clusterApiUrl } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  Account,
  Mint
} from '@solana/spl-token';
import { assert } from "chai";

describe('solana-pay-escrow', () => {
  const commitment: Commitment = "confirmed";
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
      commitment,
      wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
    });
    const wallet = NodeWallet.local();
    const options = anchor.AnchorProvider.defaultOptions();
    const provider = new anchor.AnchorProvider(connection, wallet, options);
  // console.log(provider);

  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaPay as Program<SolanaPay>;

  // let mintB = anchor.web3.Keypair.generate();
  let mintB = null;
  let merchantTokenAccountB = null;
  let buyerTokenAccountB = null;
  let vault_account_pda = null;
  let vault_account_bump = null;
  let vault_authority_pda = null;
  let vault_authority_bump = null;
  let escrow_account_pda  = null; 
  let escrow_account_bump = null; 
  const paymentAmount = 500;

  const escrowAccount = anchor.web3.Keypair.generate();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const merchantMainAccount = anchor.web3.Keypair.generate();
  const buyerMainAccount = anchor.web3.Keypair.generate();

  it('Initialize program state', async () => {
    let mintB = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0,
      anchor.web3.Keypair.generate(),
      null,
      TOKEN_PROGRAM_ID
    );
    // Airdropping tokens to a payer.
    const airdropTx = await provider.connection.requestAirdrop(
      payer.publicKey,
      1000000000
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx,
    });

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
            toPubkey: buyerMainAccount.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [payer]
    );

    // const mintB = await newMint();
    // const merchantTokenAccountB = await createTokenAccount(provider, wallet, mintB, merchantMainAccount.publicKey);
    merchantTokenAccountB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      merchantMainAccount.publicKey,
      false,
      'processed',
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    // const buyerTokenAccountB = await createTokenAccount(provider, wallet, mintB, buyerMainAccount.publicKey);
    buyerTokenAccountB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      buyerMainAccount.publicKey,
      false,
      'processed',
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await mintTo(
      provider.connection,
      wallet.payer,
      mintB,
      buyerTokenAccountB.address,
      wallet.publicKey,
      paymentAmount,
      [wallet.payer],
      null,
      TOKEN_PROGRAM_ID
    );

    let _buyerTokenAccountB = await getAccount(
      provider.connection,
      buyerTokenAccountB.address,
      'processed',
      TOKEN_PROGRAM_ID
    );

    assert.ok(Number(_buyerTokenAccountB.amount) == paymentAmount);
  });
  it('Initialize escrow', async () => {
    // console.log(program);
    let mintB = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0,
      anchor.web3.Keypair.generate(),
      null,
      TOKEN_PROGRAM_ID
    );
    // Airdropping tokens to a payer.
    const airdropTx = await provider.connection.requestAirdrop(
      payer.publicKey,
      1000000000
    );
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx,
    });

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
            toPubkey: buyerMainAccount.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [payer]
    );

    console.log('[INFO] Finish funding main accounts');
    merchantTokenAccountB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      merchantMainAccount.publicKey,
      false,
      'processed',
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log('[INFO] Finish creating merchant token accounts');
    buyerTokenAccountB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      buyerMainAccount.publicKey,
      false,
      'processed',
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log('[INFO] Finish creating buyer token accounts');

    await mintTo(
      provider.connection,
      wallet.payer,
      mintB,
      buyerTokenAccountB.address,
      wallet.publicKey,
      paymentAmount,
      [wallet.payer],
      null,
      TOKEN_PROGRAM_ID
    );

    console.log('[INFO] Finish minting to buyer token accounts');
    // const nonce = Math.floor(Math.random()*255);

    const [_vault_account_pda, _vault_account_bump] =
      await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode('token_seed'))],
        // new anchor.BN(nonce).toArrayLike(Buffer, "le", 8)
        program.programId
      );
    vault_account_pda = _vault_account_pda;
    vault_account_bump = _vault_account_bump;

    console.log('[INFO] Finish creating vault pda');

    const [_vault_authority_pda, _vault_authority_bump] =
      await PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode('vault_auth')),
          // new anchor.BN(nonce).toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
    vault_authority_pda = _vault_authority_pda;
    vault_authority_bump = _vault_authority_bump;

    console.log('[INFO] Finish creating vault authority pda');

    const [_escrow_account_pda, _escrow_account_bump] =
      await PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode('escrow')),
          // , new anchor.BN(nonce).toArrayLike(Buffer, "le", 8)
        ],
        program.programId
      );
    escrow_account_pda = _escrow_account_pda;
    escrow_account_bump = _escrow_account_bump;

    console.log('[INFO] Finish creating escrow account pda');

    // const mintBPubkey = new anchor.web3.PublicKey(mintB);
    // console.log(mintB);
    // console.log(program);
    console.log(
      `merchantMainAccount   ${merchantMainAccount.publicKey.toString()}`
    );
    console.log(`mint   ${mintB.toString()}`);
    console.log(`vaultAccount    ${vault_account_pda.toString()}`);
    console.log(`escrow_account_pda    ${escrow_account_pda.toString()}`);
    console.log(
      `merchantReceiveTokenAccount    ${merchantTokenAccountB.address.toString()}`
    );

    const tx = await program.methods
      .initialize(new anchor.BN(paymentAmount))
      .accounts({
        merchant: merchantMainAccount.publicKey,
        mint: mintB,
        vaultAccount: vault_account_pda,
        vaultAuthority: vault_authority_pda,
        merchantReceiveTokenAccount: merchantTokenAccountB.address,
        escrowAccount: escrow_account_pda,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([merchantMainAccount])
      .transaction();

    console.log('[INFO] Showing the logs');
    tx.feePayer = merchantMainAccount.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    console.log(tx.serializeMessage().toString('base64'));
    const logs = await provider.sendAndConfirm(tx, [merchantMainAccount]);

    // let _vault = await mintB.getAccountInfo(vault_account_pda);

    let _vault = await getAccount(
      provider.connection,
      vault_account_pda,
      'processed',
      TOKEN_PROGRAM_ID
    );

    assert.ok(_vault.owner.equals(vault_authority_pda));

    // // Check that the values in the escrow account match what we expect.
    // assert.ok(_escrowAccount.merchantKey.equals(merchantMainAccount.publicKey));
    // assert.ok(_escrowAccount.buyerAmount.toNumber() == paymentAmount);
    // assert.ok(
    //   _escrowAccount.merchantReceiveTokenAccount.equals(merchantTokenAccountB.address)
    // );
  });

  it("Exchange escrow state", async () => {
    console.log(buyerTokenAccountB);
    console.log(typeof(buyerTokenAccountB));
    const tx = await program.methods.exchange().accounts({
      buyer: buyerMainAccount.publicKey,
      buyerDepositTokenAccount: buyerTokenAccountB.address,
      merchantReceiveTokenAccount: merchantTokenAccountB.address,
      merchant: merchantMainAccount.publicKey,
      escrowAccount: escrow_account_pda,
      vaultAccount: vault_account_pda,
      vaultAuthority: vault_authority_pda,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).transaction();

    tx.feePayer = buyerMainAccount.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    console.log(tx.serializeMessage().toString("base64"));
    const logs = await provider.sendAndConfirm(tx, [buyerMainAccount]);
    console.log(logs)

    let _buyerTokenAccountB = await getAccount(
                  connection,
                  buyerTokenAccountB.address as PublicKey);

    let _merchantTokenAccountB = await getAccount(
                  connection,
                  merchantTokenAccountB.address as PublicKey);

    assert.ok(Number(_merchantTokenAccountB.amount) == paymentAmount);
    assert.ok(Number(_buyerTokenAccountB.amount) == 0);
  });

  it("Initialize escrow and cancel escrow", async () => {
    // Put back tokens into merchant token A account.
    let mintB = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      0,
      anchor.web3.Keypair.generate(),
      null,
      TOKEN_PROGRAM_ID
    );
    // Airdropping tokens to a payer.
    const airdropTx = await provider.connection.requestAirdrop(payer.publicKey, 1000000000);
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropTx
    });

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
            toPubkey: buyerMainAccount.publicKey,
            lamports: 100000000,
          })
        );
        return tx;
      })(),
      [payer]
    );

    console.log('[INFO] Finish funding main accounts');
    merchantTokenAccountB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      merchantMainAccount.publicKey,
      false,
      "processed",
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID);

    console.log('[INFO] Finish creating merchant token accounts');
    buyerTokenAccountB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      buyerMainAccount.publicKey,
      false,
      "processed",
      null,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID);

    console.log('[INFO] Finish creating buyer token accounts');

    await mintTo(
      provider.connection,
      wallet.payer,
      mintB,
      buyerTokenAccountB.address,
      wallet.publicKey,
      paymentAmount,
      [wallet.payer],
      null,
      TOKEN_PROGRAM_ID);

    console.log('[INFO] Finish minting to buyer token accounts');
    // const nonce = Math.floor(Math.random() * 255);

    const [_vault_account_pda, _vault_account_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token_seed"))
      // new anchor.BN(nonce).toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    vault_account_pda = _vault_account_pda;
    vault_account_bump = _vault_account_bump;

    console.log('[INFO] Finish creating vault pda');

    const [_vault_authority_pda, _vault_authority_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("vault_auth"))
      // new anchor.BN(nonce).toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    vault_authority_pda = _vault_authority_pda;
    vault_authority_bump = _vault_authority_bump;

    console.log('[INFO] Finish creating vault authority pda');

    const [_escrow_account_pda, _escrow_account_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))
      // new anchor.BN(nonce).toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
    escrow_account_pda = _escrow_account_pda;
    escrow_account_bump = _escrow_account_bump;

    console.log('[INFO] Finish creating escrow account pda');

    console.log(`merchantMainAccount   ${merchantMainAccount.publicKey.toString()}`);
    console.log(`mint   ${mintB.toString()}`);
    console.log(`vaultAccount    ${vault_account_pda.toString()}`);
    console.log(`escrow_account_pda    ${escrow_account_pda.toString()}`);
    console.log(`merchantReceiveTokenAccount    ${merchantTokenAccountB.address.toString()}`);
    const tx = await program.methods.initialize(
      new anchor.BN(paymentAmount)).accounts(
        {
          merchant: merchantMainAccount.publicKey,
          mint: mintB,
          vaultAccount: vault_account_pda,
          vaultAuthority: vault_authority_pda,
          merchantReceiveTokenAccount: merchantTokenAccountB.address,
          escrowAccount: escrow_account_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID
        }).signers([merchantMainAccount]).transaction();

    console.log("[INFO] Showing the logs");
    tx.feePayer = merchantMainAccount.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    console.log(tx.serializeMessage().toString("base64"));
    const logs = await provider.sendAndConfirm(tx, [merchantMainAccount]);

    //   // Cancel the escrow.
    const cancel_tx = await program.methods.cancel().accounts(
      {
        merchant: merchantMainAccount.publicKey,
        vaultAccount: vault_account_pda,
        vaultAuthority: vault_authority_pda,
        escrowAccount: escrow_account_pda,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).signers([merchantMainAccount]).transaction();
    console.log("[INFO] Showing the cancel logs");
    cancel_tx.feePayer = merchantMainAccount.publicKey;
    cancel_tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    console.log(cancel_tx.serializeMessage().toString("base64"));
    const cancel_logs = await provider.sendAndConfirm(cancel_tx, [merchantMainAccount]);
  //   // Check the final owner should be the provider public key.
    const _escrow_program = await connection.getAccountInfo(escrowAccount.publicKey);
    // const _merchantTokenAccountA = await mintA.getAccountInfo(merchantTokenAccountA);
    assert.ok(_escrow_program == null);
  //   // Check all the funds are still there.
    // assert.ok(_merchantTokenAccountA.amount.toNumber() == merchantAmount);
  });
});
