import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  JettonMaster,
  OpenedContract,
  SendMode,
  TonClient,
  WalletContractV4,
  beginCell,
  internal,
  toNano,
} from '@ton/ton';
import { KeyPair, mnemonicToPrivateKey } from '@ton/crypto';

const JETTON_TRANSFER_OPCODE = 0xf8a7ea5; // TEP-74
const JETTON_FORWARD_TON_AMOUNT = toNano('0.01');
// El jetton wallet destino exige (TEP-74, chequeo estandar en send_tokens):
// msg_value > forward_ton_amount + fwd_count*fwd_fee + 2*gas_consumption() +
// min_tons_for_storage(). 0.05 TON quedaba justo en el limite y abortaba con
// exit code 709 (fondos insuficientes) al probarlo de verdad contra un
// jetton en testnet — nunca se habia ejercitado este camino antes (ver
// README, "Probar el flujo de retiros con asset: USDT"). Subido con margen.
const JETTON_GAS_AMOUNT = toNano('0.15');
const COMMENT_OPCODE = 0; // "simple transfer with comment" segun convencion TON
// Un mensaje interno de TON descuenta el forward fee de red antes de
// acreditarse en destino, asi que lo que se ve en `inMessage.value.coins` es
// levemente MENOR a lo que el remitente puso en su mensaje — sin este
// margen, depositos legitimos por el monto exacto listado fallarian la
// verificacion.
const DEPOSIT_FEE_TOLERANCE_NANO = toNano('0.01');

/**
 * Wrapper sobre la hot wallet TON (@ton/ton + @ton/crypto), compartido por
 * retiros (withdrawals, paga hacia afuera) y depositos (deposits, verifica
 * pagos hacia adentro). Nunca testeado contra mainnet en este entorno — la
 * superficie de la API se verifico contra los .d.ts instalados en
 * node_modules para evitar nombres inventados. Si probaste contra testnet
 * en una sesion anterior, revisa la memoria del proyecto para el estado de
 * esa wallet de prueba.
 */
@Injectable()
export class TonService {
  private client?: TonClient;
  private wallet?: OpenedContract<WalletContractV4>;
  private keyPair?: KeyPair;

  constructor(private readonly config: ConfigService) {}

  private async getWallet(): Promise<{
    client: TonClient;
    wallet: OpenedContract<WalletContractV4>;
    keyPair: KeyPair;
  }> {
    if (this.client && this.wallet && this.keyPair) {
      return { client: this.client, wallet: this.wallet, keyPair: this.keyPair };
    }

    const mnemonic = this.config.getOrThrow<string>('TON_HOT_WALLET_MNEMONIC').trim().split(/\s+/);
    this.keyPair = await mnemonicToPrivateKey(mnemonic);

    this.client = new TonClient({
      endpoint: this.config.getOrThrow<string>('TON_RPC_ENDPOINT'),
      apiKey: this.config.get<string>('TON_RPC_API_KEY'),
    });

    const walletContract = WalletContractV4.create({ workchain: 0, publicKey: this.keyPair.publicKey });
    this.wallet = this.client.open(walletContract);

    return { client: this.client, wallet: this.wallet, keyPair: this.keyPair };
  }

  /**
   * Direccion user-friendly de la hot wallet, con el flag `testOnly`
   * correcto segun TON_RPC_ENDPOINT — muchas wallets rechazan o advierten si
   * el flag no coincide con la red a la que estan conectadas (ej. una
   * direccion `EQ...` de mainnet cuando la wallet esta en testnet), aunque
   * la cuenta subyacente sea la misma.
   */
  async getTreasuryAddress(): Promise<string> {
    const { wallet } = await this.getWallet();
    const endpoint = this.config.getOrThrow<string>('TON_RPC_ENDPOINT');
    const testOnly = endpoint.includes('testnet');
    return wallet.address.toString({ testOnly });
  }

  /** Envia TON nativo. amountNano en nanoTON (1 TON = 1e9 nanoTON). */
  async sendTon(destinationWallet: string, amountNano: bigint): Promise<string> {
    const { wallet, keyPair } = await this.getWallet();
    const seqno = await wallet.getSeqno();

    await wallet.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [internal({ to: Address.parse(destinationWallet), value: amountNano, bounce: false })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    return this.confirmAndGetHash(wallet, seqno, 'TON', destinationWallet, amountNano);
  }

  /** Envia USDT (jetton transfer segun TEP-74). amountUnits en unidades minimas (6 decimales). */
  async sendUsdt(destinationWallet: string, amountUnits: bigint): Promise<string> {
    const { client, wallet, keyPair } = await this.getWallet();
    const jettonMasterAddress = Address.parse(this.config.getOrThrow<string>('USDT_JETTON_MASTER_ADDRESS'));
    const jettonMaster = client.open(JettonMaster.create(jettonMasterAddress));
    const senderJettonWalletAddress = await jettonMaster.getWalletAddress(wallet.address);

    const body = beginCell()
      .storeUint(JETTON_TRANSFER_OPCODE, 32)
      .storeUint(BigInt(Date.now()), 64) // query_id
      .storeCoins(amountUnits)
      .storeAddress(Address.parse(destinationWallet))
      .storeAddress(wallet.address) // response_destination: recibe el TON de gas sobrante
      .storeBit(0) // sin custom_payload
      .storeCoins(JETTON_FORWARD_TON_AMOUNT)
      .storeBit(0) // sin forward_payload inline
      .endCell();

    const seqno = await wallet.getSeqno();
    await wallet.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [internal({ to: senderJettonWalletAddress, value: JETTON_GAS_AMOUNT, bounce: true, body })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    return this.confirmAndGetHash(wallet, seqno, 'USDT', destinationWallet, amountUnits);
  }

  /**
   * Busca en las transacciones recientes de la hot wallet un pago ya enviado
   * que coincida con este retiro (mismo destino y monto exacto, no antes de
   * `sinceUnixSeconds`). La usa el sweep de reconciliacion para saber si un
   * retiro atascado en PROCESSING realmente salio antes de reembolsarlo — sin
   * esto, un crash entre "enviar" y "marcar COMPLETED" llevaria a reembolsar
   * dinero que ya se pago (doble gasto para la plataforma).
   *
   * Limitacion conocida: solo mira las ultimas 50 transacciones de la wallet
   * (sin paginar por lt/hash). Si el volumen de retiros en la ventana de
   * reconciliacion supera eso, el sweep puede no encontrar un pago que si
   * ocurrio y terminar reembolsando de mas — mitigarlo requeriria paginacion
   * real, fuera de alcance de este pase.
   */
  async findRecentPayment(
    asset: 'TON' | 'USDT',
    destinationWallet: string,
    expectedAmount: bigint,
    sinceUnixSeconds: number,
  ): Promise<string | null> {
    const { client, wallet } = await this.getWallet();
    const destination = Address.parse(destinationWallet);
    const transactions = await client.getTransactions(wallet.address, { limit: 50 });

    for (const tx of transactions) {
      if (tx.now < sinceUnixSeconds) continue;

      for (const [, message] of tx.outMessages) {
        if (message.info.type !== 'internal') continue;

        if (asset === 'TON') {
          if (message.info.dest.equals(destination) && message.info.value.coins === expectedAmount) {
            return tx.hash().toString('hex');
          }
          continue;
        }

        // USDT: el mensaje interno sale hacia la jetton wallet del hot
        // wallet, no hacia el destinatario final; hay que decodificar el
        // body del transfer (TEP-74) para comparar el destino/monto reales.
        try {
          const slice = message.body.beginParse();
          if (slice.loadUint(32) !== JETTON_TRANSFER_OPCODE) continue;
          slice.loadUintBig(64); // query_id, no se usa para el match
          const amount = slice.loadCoins();
          const dest = slice.loadAddress();
          if (dest.equals(destination) && amount === expectedAmount) {
            return tx.hash().toString('hex');
          }
        } catch {
          continue; // body que no es un jetton transfer con esta forma
        }
      }
    }

    return null;
  }

  /**
   * Busca un DEPOSITO entrante (no un pago nuestro saliente) que coincida
   * con la referencia unica embebida como comentario en el mensaje — asi
   * identificamos a que DepositRequest corresponde una transferencia
   * llegada de cualquier wallet externa, sin necesitar direcciones de
   * deposito unicas por usuario. El comentario sigue la convencion TON
   * estandar: opcode uint32 = 0 seguido del texto UTF-8 (`comment()` de
   * @ton/core en el emisor).
   *
   * Misma limitacion que `findRecentPayment`: solo las ultimas 50
   * transacciones, sin paginar.
   */
  async findIncomingDeposit(
    reference: string,
    expectedAmountNano: bigint,
    sinceUnixSeconds: number,
  ): Promise<string | null> {
    const { client, wallet } = await this.getWallet();
    const transactions = await client.getTransactions(wallet.address, { limit: 50 });

    for (const tx of transactions) {
      if (tx.now < sinceUnixSeconds) continue;

      const inMessage = tx.inMessage;
      if (!inMessage || inMessage.info.type !== 'internal') continue;
      if (inMessage.info.value.coins < expectedAmountNano - DEPOSIT_FEE_TOLERANCE_NANO) continue;

      try {
        const slice = inMessage.body.beginParse();
        if (slice.loadUint(32) !== COMMENT_OPCODE) continue;
        const comment = slice.loadStringTail();
        if (comment === reference) {
          return tx.hash().toString('hex');
        }
      } catch {
        continue; // body sin comentario legible
      }
    }

    return null;
  }

  /**
   * Confirma el envio esperando a que el seqno de la wallet avance (prueba de
   * que el mensaje salio de la wallet) y despues identifica la transaccion
   * exacta del pago reusando `findRecentPayment` (misma decodificacion que
   * usa el sweep de reconciliacion) en vez de asumir que es "la ultima
   * transaccion de la wallet". Esa suposicion era incorrecta para USDT: la
   * jetton wallet devuelve el TON de gas sobrante en un mensaje de "excess"
   * que llega en una transaccion posterior y puede ganarle la carrera al
   * polling, dejando guardado el hash del vuelto en vez del de la
   * transferencia real (bug encontrado probando esto de punta a punta contra
   * testnet — ver README). Si el seqno ya avanzo pero `findRecentPayment`
   * todavia no ve la transaccion (indexado con lag), se sigue reintentando
   * en vez de devolver un hash equivocado.
   */
  private async confirmAndGetHash(
    wallet: OpenedContract<WalletContractV4>,
    previousSeqno: number,
    asset: 'TON' | 'USDT',
    destinationWallet: string,
    expectedAmount: bigint,
    timeoutMs = 90_000,
  ): Promise<string> {
    const sinceUnixSeconds = Math.floor(Date.now() / 1000) - 60;
    const start = Date.now();
    let seqnoConfirmed = false;

    while (Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      if (!seqnoConfirmed) {
        const seqno = await wallet.getSeqno();
        if (seqno <= previousSeqno) continue;
        seqnoConfirmed = true;
      }

      const txHash = await this.findRecentPayment(asset, destinationWallet, expectedAmount, sinceUnixSeconds);
      if (txHash) {
        return txHash;
      }
    }
    throw new Error('Timed out waiting for TON transaction confirmation');
  }
}
