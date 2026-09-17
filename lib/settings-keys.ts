/**
 * The keys of the facts the owner records, and their labels.
 *
 * Split from `settings.ts` because that module reaches the database and the
 * bucket: the hazard communication programme decides what it says from these
 * keys alone, and must stay renderable without a worker runtime.
 */

export const SETTING_KEYS = {
  registeredAddress: 'entity.registered_address',
  telephone: 'entity.telephone',
  emergencyTelephone: 'entity.emergency_telephone',
  hazcomResponsible: 'hazcom.responsible_person',
  hazcomWorkplace: 'hazcom.workplace',
  hazcomSdsAccess: 'hazcom.sds_access',
  hazcomTraining: 'hazcom.training',
  hazcomNonRoutine: 'hazcom.non_routine',
} as const;

/**
 * Storefront settings staff change on /manage/coupons. Kept out of SETTING_KEYS on
 * purpose: the hazard communication form iterates that object, and a shipping rule
 * must never print on an OSHA document.
 */
export const SHIPPING_SETTING_KEYS = {
  /** Materials subtotal (after any promo code), in cents, from which the cheapest delivery is free. Unset = off. */
  freeShippingThresholdCents: 'shipping.free_threshold_cents',
} as const;

export type SettingKey =
  | (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]
  | (typeof SHIPPING_SETTING_KEYS)[keyof typeof SHIPPING_SETTING_KEYS];

export const SETTING_LABEL: Record<SettingKey, string> = {
  'entity.registered_address':
    'Registered address (printed on labels and the hazard communication programme)',
  'entity.telephone': 'Telephone number of the responsible party',
  'entity.emergency_telephone': 'Emergency telephone number',
  'hazcom.responsible_person':
    'Person responsible for the hazard communication programme',
  'hazcom.workplace': 'Workplace this programme covers',
  'hazcom.sds_access': 'How staff reach a safety data sheet',
  'hazcom.training': 'Training arrangements',
  'hazcom.non_routine': 'Non-routine tasks and how they are handled',
  'shipping.free_threshold_cents': 'Free shipping from this materials subtotal (cents; blank = off)',
};

const KEY_ORDER: SettingKey[] = [...Object.values(SETTING_KEYS), ...Object.values(SHIPPING_SETTING_KEYS)];

export function isSettingKey(value: string): value is SettingKey {
  return (KEY_ORDER as string[]).includes(value);
}

export type SettingsMap = Partial<Record<SettingKey, string>>;
