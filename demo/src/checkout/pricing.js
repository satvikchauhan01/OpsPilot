const SHIPPING_FEE = 4.99;

const COUPONS = {
  SPRING10: { percentOff: 10 },
  FREESHIP: { freeShipping: true },
};

const NO_DISCOUNT = {};

// Unknown and expired codes are supposed to be ignored. Release 1.4.2 lost that fallback,
// so those codes crash the pricing step. The demo builds 1.4.2 with
// RELEASE_DEFECT=coupon-lookup (see demo/releases.json) to reproduce it.
const unknownCoupon = process.env.RELEASE_DEFECT === 'coupon-lookup' ? undefined : NO_DISCOUNT;

function findCoupon(code) {
  return COUPONS[code.trim().toUpperCase()] ?? unknownCoupon;
}

function priceOrder(lines, couponCode) {
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const coupon = couponCode ? findCoupon(couponCode) : NO_DISCOUNT;

  const discount = subtotal * ((coupon.percentOff ?? 0) / 100);
  const shipping = coupon.freeShipping ? 0 : SHIPPING_FEE;

  return {
    subtotal: roundCents(subtotal),
    discount: roundCents(discount),
    shipping,
    total: roundCents(subtotal - discount + shipping),
  };
}

function roundCents(amount) {
  return Math.round(amount * 100) / 100;
}

module.exports = { priceOrder };
