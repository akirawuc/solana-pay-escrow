import {IDL, SolanaPay} from "./IDL/solana_pay";
import {
    MERCHANT_PRIVATE_KEY,
    PAY_ESCROW_PROGRAM_ID,
    PAYER_PRIVATE_KEY,
    RPC_URL,
    RPC_WS_URL
} from "./config";
import {AnchorProvider, BorshCoder, Program, Wallet} from "@project-serum/anchor";
import {Connection, Keypair, PublicKey, Signer} from "@solana/web3.js";
import {cancel, exchange, initialize} from "./payEscrow";
import {getOrCreateAssociatedTokenAccount} from "@solana/spl-token";

async function main() {
    console.log(`hello`)
    const connection = new Connection(RPC_URL, {
        wsEndpoint:RPC_WS_URL,
        commitment:"confirmed"
    });


    const merchantKP=Keypair.fromSecretKey(Uint8Array.from(MERCHANT_PRIVATE_KEY))
    const merchantWallet=new Wallet(merchantKP)
    console.log(`your merchant wallet publickey is ${merchantWallet.publicKey.toBase58()}`)
    const provider = new AnchorProvider(connection, merchantWallet, AnchorProvider.defaultOptions())
    const program = new Program(
        IDL,
        PAY_ESCROW_PROGRAM_ID,
        provider,
        new BorshCoder(IDL)
    ) as Program<SolanaPay>;

    const token=new PublicKey("So11111111111111111111111111111111111111112")

    /*
   * initialize instruction
   *  */
    // const initializeReq={
    //     merchant:merchantWallet.payer,
    //     token:new PublicKey("So11111111111111111111111111111111111111112"),
    //     amount:10000n,
    // }
    // const res1=await initialize(program,initializeReq)

    /*
  * initialize instruction
  *  */
    const payerKP=Keypair.fromSecretKey(Uint8Array.from(PAYER_PRIVATE_KEY))
    const payerWallet=new Wallet(payerKP)
    console.log(`your payer wallet publickey is ${payerWallet.publicKey.toBase58()}`)
    const payerProvider = new AnchorProvider(connection, payerWallet, AnchorProvider.defaultOptions())
    const payerProgram = new Program(
        IDL,
        PAY_ESCROW_PROGRAM_ID,
        payerProvider,
        new BorshCoder(IDL)
    ) as Program<SolanaPay>;
    const exchangeReq={
        payer:payerWallet.payer,
        merchant:merchantWallet.publicKey,
        token:token
    }
    const res2=await exchange(payerProgram,exchangeReq)

    /*
    * cancel instruction
    *  */
    // const res3=await cancel(program,merchantWallet.payer)
}

main()
    .then(()=>console.log(`exec successfully`))
    .catch((err)=>{
        console.log(`exec fail,err:${err}`)
        process.exitCode=1
    })
