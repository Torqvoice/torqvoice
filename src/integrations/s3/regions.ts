import type { SettingOption } from '@/features/integrations/Lib/types'

/**
 * The regions each vendor offers, as a list to pick from instead of a code to
 * remember. The value is what the vendor's S3 endpoint wants; the label puts
 * the place first, since that is what a workshop knows about its bucket.
 * Cloudflare R2 has no region (the account id stands in for it) and the
 * self-hosted "other" provider takes whatever its storage wants, typed.
 */
const region = (value: string, place: string): SettingOption => ({
  value,
  label: `${place} (${value})`,
})

export const AWS_REGIONS: readonly SettingOption[] = [
  region('us-east-1', 'US East, Northern Virginia'),
  region('us-east-2', 'US East, Ohio'),
  region('us-west-1', 'US West, Northern California'),
  region('us-west-2', 'US West, Oregon'),
  region('ca-central-1', 'Canada, Central'),
  region('ca-west-1', 'Canada, Calgary'),
  region('mx-central-1', 'Mexico, Central'),
  region('sa-east-1', 'South America, Sao Paulo'),
  region('eu-west-1', 'Europe, Ireland'),
  region('eu-west-2', 'Europe, London'),
  region('eu-west-3', 'Europe, Paris'),
  region('eu-central-1', 'Europe, Frankfurt'),
  region('eu-central-2', 'Europe, Zurich'),
  region('eu-north-1', 'Europe, Stockholm'),
  region('eu-south-1', 'Europe, Milan'),
  region('eu-south-2', 'Europe, Spain'),
  region('il-central-1', 'Israel, Tel Aviv'),
  region('me-south-1', 'Middle East, Bahrain'),
  region('me-central-1', 'Middle East, UAE'),
  region('af-south-1', 'Africa, Cape Town'),
  region('ap-south-1', 'Asia Pacific, Mumbai'),
  region('ap-south-2', 'Asia Pacific, Hyderabad'),
  region('ap-east-1', 'Asia Pacific, Hong Kong'),
  region('ap-east-2', 'Asia Pacific, Taipei'),
  region('ap-northeast-1', 'Asia Pacific, Tokyo'),
  region('ap-northeast-2', 'Asia Pacific, Seoul'),
  region('ap-northeast-3', 'Asia Pacific, Osaka'),
  region('ap-southeast-1', 'Asia Pacific, Singapore'),
  region('ap-southeast-2', 'Asia Pacific, Sydney'),
  region('ap-southeast-3', 'Asia Pacific, Jakarta'),
  region('ap-southeast-4', 'Asia Pacific, Melbourne'),
  region('ap-southeast-5', 'Asia Pacific, Malaysia'),
  region('ap-southeast-7', 'Asia Pacific, Thailand'),
]

export const B2_REGIONS: readonly SettingOption[] = [
  region('us-west-000', 'US West'),
  region('us-west-001', 'US West'),
  region('us-west-002', 'US West'),
  region('us-west-004', 'US West'),
  region('us-east-005', 'US East'),
  region('ca-east-006', 'Canada East'),
  region('eu-central-003', 'Europe, Amsterdam'),
]

export const WASABI_REGIONS: readonly SettingOption[] = [
  region('us-east-1', 'US East, Northern Virginia'),
  region('us-east-2', 'US East, Northern Virginia'),
  region('us-central-1', 'US Central, Texas'),
  region('us-west-1', 'US West, Oregon'),
  region('ca-central-1', 'Canada, Toronto'),
  region('eu-central-1', 'Europe, Amsterdam'),
  region('eu-central-2', 'Europe, Frankfurt'),
  region('eu-west-1', 'Europe, London'),
  region('eu-west-2', 'Europe, Paris'),
  region('eu-west-3', 'Europe, London'),
  region('eu-south-1', 'Europe, Milan'),
  region('ap-northeast-1', 'Asia Pacific, Tokyo'),
  region('ap-northeast-2', 'Asia Pacific, Osaka'),
  region('ap-southeast-1', 'Asia Pacific, Singapore'),
  region('ap-southeast-2', 'Asia Pacific, Sydney'),
]

export const HETZNER_REGIONS: readonly SettingOption[] = [
  region('fsn1', 'Falkenstein, Germany'),
  region('nbg1', 'Nuremberg, Germany'),
  region('hel1', 'Helsinki, Finland'),
]

/** The region list per provider; a provider missing here takes a typed region. */
export const REGIONS_BY_PROVIDER: Record<string, readonly SettingOption[]> = {
  aws: AWS_REGIONS,
  b2: B2_REGIONS,
  wasabi: WASABI_REGIONS,
  hetzner: HETZNER_REGIONS,
}
