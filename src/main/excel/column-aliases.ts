/**
 * ============================================================================
 * ⚠️  INVENTED — NOT FROM THE SPEC. REVIEW THIS FILE FIRST.
 * ============================================================================
 *
 * The phase brief says "auto-detect … using the alias list from the spec", and that spec
 * document is not in the repo (CLAUDE.md §8). This list was written from the column names
 * TikTok Shop / Shopee / Lazada order exports typically use — it is a working stand-in,
 * not the real thing.
 *
 * Correcting it is a single-file edit: nothing else knows any header names. Add the real
 * aliases here, re-run `npm run import:verify`, and detection improves everywhere.
 *
 * Rules for editing:
 *   * Aliases must be written in NORMALISED form — see `normaliseHeader()`. Lowercase,
 *     words joined by underscores, no punctuation. "SKU Reference No." → sku_reference_no.
 *   * Order matters: earlier aliases win. `seller_sku` is listed before `sku_id` because
 *     TikTok's `SKU ID` is its own internal id while `Seller SKU` is the code the factory
 *     actually recognises.
 */

import { FIELD_LABELS, REQUIRED_MAPPING_FIELDS, type MappableField } from '@shared/types'

/** The fields shared with the renderer — labels and required set live in shared/types.ts. */
export type DetectableField = MappableField

export { FIELD_LABELS }

/**
 * Order in which fields claim columns. Not the display order: the strongest, least
 * ambiguous fields go first so a generic column can't be taken by the wrong field.
 */
export const DETECTABLE_FIELDS: readonly DetectableField[] = [
  'sku',
  'quantity',
  'orderId',
  'variation',
  'colour',
  'size'
]

/** Which fields must be found for a file to import without asking the operator. */
export const REQUIRED_FIELDS: readonly DetectableField[] = REQUIRED_MAPPING_FIELDS

export const COLUMN_ALIASES: Record<DetectableField, readonly string[]> = {
  orderId: [
    'order_id',
    'order_number',
    'order_no',
    'order_sn',
    'order_reference',
    'order_ref',
    'order_code',
    'ordernumber',
    'orderid'
  ],

  sku: [
    // Seller-facing codes first — these are the ones a factory recognises.
    'seller_sku',
    'sku_reference_no',
    'sku_reference',
    'merchant_sku',
    'sku',
    'sku_code',
    'sku_no',
    'product_sku',
    'item_sku',
    'variation_sku',
    'style_code',
    'article_number',
    'article_no',
    // Platform-internal ids last: better than nothing, but rarely the factory code.
    'sku_id',
    'lazada_sku',
    'product_code',
    'item_code'
  ],

  variation: [
    'variation_name',
    'variation',
    'variant_name',
    'variant',
    'product_variation',
    'variation_value',
    'variation_info',
    'sku_attributes',
    'attributes',
    'specification',
    'spec',
    'option_name',
    'options'
  ],

  colour: ['colour', 'color', 'colour_name', 'color_name', 'product_colour', 'product_color'],

  size: ['size', 'size_name', 'size_code', 'product_size'],

  quantity: [
    'quantity',
    'qty',
    'quantity_ordered',
    'order_quantity',
    'item_quantity',
    'qty_ordered',
    'quantity_purchased',
    'purchased_quantity',
    'no_of_items',
    'units',
    'pieces',
    'pcs'
  ]
}

/**
 * Distinctive headers that identify a marketplace. Also invented — same caveat.
 *
 * These are scored, not matched one-for-one: a file needs the most hits to win, so one
 * shared column name (`order_id` is everywhere) can't decide it.
 */
export const PLATFORM_SIGNALS: Record<string, readonly string[]> = {
  tiktok: [
    'seller_sku',
    'sku_id',
    'sku_unit_original_price',
    'sku_subtotal_before_discount',
    'product_name',
    'order_status',
    'created_time'
  ],
  shopee: [
    'sku_reference_no',
    'variation_name',
    'buyer_username',
    'deal_price',
    'order_creation_date',
    'product_subtotal'
  ],
  lazada: [
    'lazada_sku',
    'seller_sku',
    'order_item_id',
    'order_number',
    'item_name',
    'unit_price',
    'paid_price'
  ]
}