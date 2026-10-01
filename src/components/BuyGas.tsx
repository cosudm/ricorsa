'use client';
import { useState } from 'react';
import { FinixCheckout } from './FinixCheckout';
import { PayPalBuyGas } from './PayPalBuyGas';
import type { CardCheckout } from './PricingPlans';

export type BuyGasBlockProps = {
  /** Dollars per block and gas per block. */
  blockUsd: number; blockGas: number;
  maxBlocks?: number;
  finix: CardCheckout;
  /** PayPal's client id, empty when PayPal is not set up. */
  clientId: string;
  afterHref?: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US');
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * Pay-As-You-Go gas: one picker for how many blocks, paid by card on the page (the main way) or through PayPal behind
 * a small link. Either way the amount and the account it credits are decided on our server, never by the browser.
 */
export function BuyGas({ blockUsd, blockGas, maxBlocks = 10, finix, clientId, afterHref = '/app' }: BuyGasBlockProps) {
  const [blocks, setBlocks] = useState(1);
  const cardReady = !!finix; const paypalReady = !!clientId;
  const [paypal, setPaypal] = useState(!cardReady);
  const total = blockUsd * blocks;
  if (!cardReady && !paypalReady) return <div className="notice">Checkout is being set up. Please check back in a moment.</div>;
  return (
    <div className="buy-gas">
      <div className="blocks" role="group" aria-label="How much gas">
        <button type="button" className="btn sm" onClick={() => setBlocks(b => Math.max(1, b - 1))} disabled={blocks <= 1} aria-label="Less">&minus;</button>
        <div className="amount"><b>{gasWord(blockGas * blocks)}</b><span>{money(total)}</span></div>
        <button type="button" className="btn sm" onClick={() => setBlocks(b => Math.min(maxBlocks, b + 1))} disabled={blocks >= maxBlocks} aria-label="More">+</button>
      </div>
      {cardReady && finix && (
        <FinixCheckout env={finix.env} applicationId={finix.applicationId} purpose={{ kind: 'gas', blocks, usd: total, gas: blockGas * blocks }} afterHref={afterHref} openLabel={`Pay ${money(total)} by card`} />
      )}
      {paypalReady && (
        paypal ? (
          <div className="alt-pay">
            {cardReady && <div className="or">or with PayPal</div>}
            <PayPalBuyGas clientId={clientId} blockUsd={blockUsd} blockGas={blockGas} maxBlocks={maxBlocks} afterHref={afterHref} blocks={blocks} />
          </div>
        ) : (
          <button type="button" className="linkish" onClick={() => setPaypal(true)}>Pay with PayPal instead</button>
        )
      )}
    </div>
  );
}
