import type { Condition, InputType, SeverityScale } from './conditions'

/**
 * Starting points for the template builder.
 *
 * A preset is only ever a starting point: it is copied into an editable
 * template the moment the user picks it, so a workshop can bend any of these to
 * its own country, its own equipment and its own house checklist. Nothing here
 * is enforced at runtime.
 *
 * The limit values in the EU presets are the common Union-wide figures from
 * Directive 2014/45/EU Annex I; several member states test to stricter numbers,
 * which is exactly why every threshold is an editable field on the check rather
 * than a constant in the code.
 */

export interface PresetItem {
  name: string
  code?: string
  description?: string
  inputType?: InputType
  unit?: string
  minValue?: number
  maxValue?: number
  choices?: string[]
  required?: boolean
  photoRequired?: boolean
  defaultSeverity?: Extract<Condition, 'attention' | 'fail' | 'dangerous'>
}

export interface PresetSection {
  name: string
  code?: string
  description?: string
  items: PresetItem[]
}

export interface TemplatePreset {
  id: string
  name: string
  description: string
  /** ISO-3166 alpha-2, or null when the preset is not tied to one country. */
  country: string | null
  /** Regime the checklist follows; shown as a badge in the gallery. */
  standard: string
  standardLabel: string
  severityScale: SeverityScale
  /** Used to group the gallery. */
  group: 'regulatory' | 'workshop' | 'specialist'
  sections: PresetSection[]
}

/* -------------------------------------------------------------------------- */
/* Directive 2014/45/EU — Annex I categories 0 to 8                           */
/* -------------------------------------------------------------------------- */

const EU_IDENTIFICATION: PresetSection = {
  name: 'Identification of the vehicle',
  code: '0',
  description: 'Annex I, item 0. Confirms the vehicle presented matches its papers.',
  items: [
    { name: 'Registration plates', code: '0.1', required: true },
    {
      name: 'Vehicle identification / chassis number',
      code: '0.2',
      description: 'VIN present, legible and matching the registration document.',
      required: true,
    },
  ],
}

const EU_BRAKING: PresetSection = {
  name: 'Braking equipment',
  code: '1',
  description: 'Annex I, item 1. Mechanical condition, then measured performance.',
  items: [
    { name: 'Service brake pedal / hand lever pivot', code: '1.1.1' },
    { name: 'Pedal / lever condition and travel', code: '1.1.2' },
    { name: 'Vacuum pump or compressor and reservoirs', code: '1.1.3' },
    { name: 'Low pressure warning gauge or indicator', code: '1.1.4' },
    { name: 'Parking brake actuator, lever and ratchet', code: '1.1.6' },
    { name: 'Brake valves', code: '1.1.7' },
    { name: 'Brake servo unit and master cylinder', code: '1.1.10' },
    { name: 'Rigid brake pipes', code: '1.1.11', photoRequired: false },
    { name: 'Flexible brake hoses', code: '1.1.12' },
    {
      name: 'Brake linings and pads',
      code: '1.1.13',
      description: 'Remaining friction material at the thinnest point.',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 3,
      defaultSeverity: 'fail',
    },
    { name: 'Brake drums and discs', code: '1.1.14' },
    { name: 'Brake cables, rods, levers and linkages', code: '1.1.15' },
    { name: 'Brake actuators', code: '1.1.16' },
    { name: 'Load sensing valve', code: '1.1.17' },
    { name: 'Complete braking system', code: '1.1.21' },
    {
      name: 'Service brake efficiency',
      code: '1.2.2',
      description: 'Braking rate as a percentage of the maximum authorised mass. Set the figure your national test uses.',
      inputType: 'measurement',
      unit: '%',
      minValue: 50,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      name: 'Service brake imbalance across an axle',
      code: '1.2.1',
      description: 'Difference between the braking forces on the two wheels of an axle.',
      inputType: 'measurement',
      unit: '%',
      maxValue: 30,
      defaultSeverity: 'fail',
    },
    {
      name: 'Parking brake efficiency',
      code: '1.4.2',
      inputType: 'measurement',
      unit: '%',
      minValue: 16,
      required: true,
      defaultSeverity: 'fail',
    },
    { name: 'Anti-lock braking system (ABS)', code: '1.6' },
    { name: 'Electronic braking system (EBS)', code: '1.7' },
    { name: 'Brake fluid', code: '1.8', description: 'Contamination and boiling point.' },
  ],
}

const EU_STEERING: PresetSection = {
  name: 'Steering',
  code: '2',
  description: 'Annex I, item 2.',
  items: [
    { name: 'Mechanical condition of the steering', code: '2.1' },
    { name: 'Steering wheel, column and handlebars', code: '2.2' },
    {
      name: 'Steering play',
      code: '2.3',
      description: 'Free movement at the rim before the road wheels respond.',
      inputType: 'measurement',
      unit: 'mm',
      maxValue: 120,
      defaultSeverity: 'fail',
    },
    { name: 'Wheel alignment', code: '2.4' },
    { name: 'Power steering', code: '2.6' },
  ],
}

const EU_VISIBILITY: PresetSection = {
  name: 'Visibility',
  code: '3',
  description: 'Annex I, item 3.',
  items: [
    { name: 'Field of vision', code: '3.1' },
    { name: 'Condition of the glass', code: '3.2', description: 'Chips and cracks in the swept area of the windscreen.' },
    { name: 'Rear-view mirrors or devices', code: '3.3' },
    { name: 'Windscreen wipers', code: '3.4' },
    { name: 'Windscreen washers', code: '3.5' },
    { name: 'Demisting and defrosting system', code: '3.6' },
  ],
}

const EU_LIGHTING: PresetSection = {
  name: 'Lamps, reflectors and electrical equipment',
  code: '4',
  description: 'Annex I, item 4.',
  items: [
    { name: 'Headlamps — condition and operation', code: '4.1.1' },
    {
      name: 'Headlamp aim',
      code: '4.1.2',
      description: 'Downward inclination of the dipped beam.',
      inputType: 'measurement',
      unit: '%',
      minValue: -2.5,
      maxValue: -0.5,
      defaultSeverity: 'attention',
    },
    { name: 'Position, side marker and daytime running lamps', code: '4.2' },
    { name: 'Stop lamps', code: '4.3', required: true },
    { name: 'Direction indicator and hazard warning lamps', code: '4.4' },
    { name: 'Front and rear fog lamps', code: '4.5' },
    { name: 'Reversing lamps', code: '4.6' },
    { name: 'Rear registration plate lamp', code: '4.7' },
    { name: 'Retro reflectors and conspicuity markings', code: '4.8' },
    { name: 'Tell-tales', code: '4.9' },
    { name: 'Electrical connections to a trailer', code: '4.10' },
    { name: 'Electrical wiring', code: '4.11' },
    { name: 'Battery', code: '4.13' },
  ],
}

const EU_RUNNING_GEAR: PresetSection = {
  name: 'Axles, wheels, tyres and suspension',
  code: '5',
  description: 'Annex I, item 5. Tread depth is recorded per wheel.',
  items: [
    { name: 'Axles', code: '5.1.1' },
    { name: 'Stub axles and wheel bearings', code: '5.1.3' },
    { name: 'Wheels', code: '5.2.1' },
    { name: 'Tyre condition — sidewalls, load and speed rating', code: '5.2.3' },
    {
      name: 'Tread depth — front left',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      name: 'Tread depth — front right',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      name: 'Tread depth — rear left',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      name: 'Tread depth — rear right',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    { name: 'Springs and stabiliser', code: '5.3.1' },
    { name: 'Shock absorbers', code: '5.3.2' },
    { name: 'Suspension arms, rods and joints', code: '5.3.4' },
  ],
}

const EU_CHASSIS: PresetSection = {
  name: 'Chassis and chassis attachments',
  code: '6',
  description: 'Annex I, item 6.',
  items: [
    { name: 'Chassis or frame and attachments', code: '6.1.1' },
    { name: 'Exhaust pipes and silencer', code: '6.1.2' },
    { name: 'Fuel tank and pipes', code: '6.1.3' },
    { name: 'Spare wheel carrier', code: '6.1.6' },
    { name: 'Coupling device and towing equipment', code: '6.1.7' },
    { name: 'Cab and bodywork condition', code: '6.2.1' },
    { name: 'Doors and door catches', code: '6.2.3' },
    { name: 'Floor', code: '6.2.4' },
    { name: 'Driver seat and seats', code: '6.2.5' },
    { name: 'Steps', code: '6.2.7' },
    { name: 'Mudguards and spray suppression', code: '6.2.11' },
  ],
}

const EU_OTHER_EQUIPMENT: PresetSection = {
  name: 'Other equipment',
  code: '7',
  description: 'Annex I, item 7. Some checks apply only to certain vehicle categories.',
  items: [
    { name: 'Safety belts, buckles and restraint systems', code: '7.1', required: true },
    { name: 'Fire extinguisher', code: '7.2' },
    { name: 'Locks and anti-theft device', code: '7.3' },
    { name: 'Warning triangle', code: '7.4' },
    { name: 'First aid kit', code: '7.5' },
    { name: 'Audible warning device', code: '7.7' },
    { name: 'Speedometer', code: '7.8' },
    { name: 'Tachograph', code: '7.9' },
    { name: 'Speed limitation device', code: '7.10' },
    {
      name: 'Odometer reading',
      code: '7.11',
      description: 'Reading at the time of the test. Annex IV requires this on the certificate.',
      inputType: 'measurement',
      unit: 'km',
      required: true,
    },
    { name: 'Electronic stability control (ESC)', code: '7.12' },
  ],
}

const EU_NUISANCE: PresetSection = {
  name: 'Nuisance',
  code: '8',
  description: 'Annex I, item 8. Emissions and noise. Fill in whichever row matches the fuel.',
  items: [
    { name: 'Noise suppression system', code: '8.1' },
    {
      name: 'Petrol — CO at idle',
      code: '8.2.1.2',
      inputType: 'measurement',
      unit: '%',
      maxValue: 0.5,
      defaultSeverity: 'fail',
    },
    {
      name: 'Petrol — lambda at high idle',
      code: '8.2.1.2',
      inputType: 'measurement',
      minValue: 0.97,
      maxValue: 1.03,
      defaultSeverity: 'fail',
    },
    {
      name: 'Diesel — smoke opacity',
      code: '8.2.2.2',
      description: 'Absorption coefficient from a free acceleration test.',
      inputType: 'measurement',
      unit: 'm⁻¹',
      maxValue: 1.5,
      defaultSeverity: 'fail',
    },
    { name: 'Exhaust after-treatment system', code: '8.2.2.1', description: 'DPF, EGR and SCR present and unmodified.' },
    { name: 'Fluid leaks', code: '8.5', defaultSeverity: 'attention' },
  ],
}

const EU_SECTIONS: PresetSection[] = [
  EU_IDENTIFICATION,
  EU_BRAKING,
  EU_STEERING,
  EU_VISIBILITY,
  EU_LIGHTING,
  EU_RUNNING_GEAR,
  EU_CHASSIS,
  EU_OTHER_EQUIPMENT,
  EU_NUISANCE,
]

/** Drops checks that make no sense on a two- or three-wheeler. */
const MOTORCYCLE_EXCLUDED_CODES = new Set([
  '1.1.17',
  '3.1',
  '3.4',
  '3.5',
  '3.6',
  '5.2.3-rear-extra',
  '6.2.3',
  '6.2.4',
  '6.2.7',
  '7.1',
  '7.9',
  '7.10',
  '7.12',
])

const MOTORCYCLE_SECTIONS: PresetSection[] = EU_SECTIONS.map((section) => ({
  ...section,
  items: section.items
    .filter((item) => !(item.code && MOTORCYCLE_EXCLUDED_CODES.has(item.code)))
    .filter((item) => !item.name.startsWith('Tread depth — rear right'))
    .filter((item) => !item.name.startsWith('Tread depth — front right'))
    .map((item) =>
      item.name === 'Tread depth — front left'
        ? { ...item, name: 'Tread depth — front tyre', minValue: 1 }
        : item.name === 'Tread depth — rear left'
          ? { ...item, name: 'Tread depth — rear tyre', minValue: 1 }
          : item
    ),
})).filter((section) => section.items.length > 0)

/* -------------------------------------------------------------------------- */
/* Non-regulatory workshop checklists                                         */
/* -------------------------------------------------------------------------- */

const STANDARD_MULTIPOINT: PresetSection[] = [
  {
    name: 'Exterior',
    items: [
      { name: 'Body condition' },
      { name: 'Paint' },
      { name: 'Lights' },
      { name: 'Windscreen' },
      { name: 'Wipers' },
      { name: 'Mirrors' },
    ],
  },
  {
    name: 'Under hood',
    items: [
      { name: 'Engine oil level and condition' },
      { name: 'Coolant', inputType: 'measurement', unit: '°C', maxValue: -20, defaultSeverity: 'attention' },
      { name: 'Brake fluid' },
      { name: 'Power steering fluid' },
      { name: 'Battery voltage', inputType: 'measurement', unit: 'V', minValue: 12.4, defaultSeverity: 'attention' },
      { name: 'Drive belts' },
      { name: 'Hoses' },
      { name: 'Air filter' },
      { name: 'Cabin filter' },
    ],
  },
  {
    name: 'Under vehicle',
    items: [
      { name: 'Exhaust system' },
      { name: 'Suspension' },
      { name: 'CV joints and boots' },
      { name: 'Brake lines' },
      { name: 'Fluid leaks' },
    ],
  },
  {
    name: 'Brakes',
    items: [
      { name: 'Front pads', inputType: 'measurement', unit: 'mm', minValue: 3, defaultSeverity: 'fail' },
      { name: 'Rear pads', inputType: 'measurement', unit: 'mm', minValue: 3, defaultSeverity: 'fail' },
      { name: 'Discs' },
      { name: 'Parking brake' },
    ],
  },
  {
    name: 'Tyres',
    items: [
      { name: 'Tread depth — front left', inputType: 'measurement', unit: 'mm', minValue: 1.6, defaultSeverity: 'fail' },
      { name: 'Tread depth — front right', inputType: 'measurement', unit: 'mm', minValue: 1.6, defaultSeverity: 'fail' },
      { name: 'Tread depth — rear left', inputType: 'measurement', unit: 'mm', minValue: 1.6, defaultSeverity: 'fail' },
      { name: 'Tread depth — rear right', inputType: 'measurement', unit: 'mm', minValue: 1.6, defaultSeverity: 'fail' },
      { name: 'Tyre pressure', inputType: 'measurement', unit: 'bar', minValue: 1.8, maxValue: 3.5, defaultSeverity: 'attention' },
      { name: 'Spare tyre or repair kit' },
    ],
  },
  {
    name: 'Interior',
    items: [
      { name: 'Warning lights' },
      { name: 'Horn' },
      { name: 'Air conditioning' },
      { name: 'Heater' },
      { name: 'Seat belts' },
    ],
  },
]

const PRE_PURCHASE: PresetSection[] = [
  {
    name: 'Documentation and history',
    items: [
      { name: 'Registration document matches the vehicle', required: true },
      { name: 'VIN', inputType: 'text', required: true },
      { name: 'Service history', inputType: 'choice', choices: ['Full', 'Partial', 'None'] },
      { name: 'Outstanding recalls' },
      { name: 'Previous accident damage' },
    ],
  },
  {
    name: 'Body and paint',
    items: [
      { name: 'Panel gaps' },
      { name: 'Paint thickness — worst panel', inputType: 'measurement', unit: 'µm', minValue: 80, maxValue: 200, defaultSeverity: 'attention' },
      { name: 'Corrosion', photoRequired: true },
      { name: 'Glass and lights' },
    ],
  },
  {
    name: 'Mechanical',
    items: [
      { name: 'Cold start' },
      { name: 'Engine noise' },
      { name: 'Compression — lowest cylinder', inputType: 'measurement', unit: 'bar', minValue: 10, defaultSeverity: 'fail' },
      { name: 'Gearbox and clutch' },
      { name: 'Fault codes on the diagnostic port', inputType: 'text' },
      { name: 'Road test' },
    ],
  },
  {
    name: 'Wear items',
    items: [
      { name: 'Brake pads and discs' },
      { name: 'Tyres including date codes' },
      { name: 'Suspension bushes' },
      { name: 'Exhaust' },
    ],
  },
]

const EV_HYBRID: PresetSection[] = [
  {
    name: 'High-voltage safety',
    description: 'Carry out with the high-voltage system isolated and the vehicle immobilised.',
    items: [
      { name: 'Service disconnect and isolation procedure followed', required: true },
      { name: 'Orange high-voltage cabling — chafing or damage', photoRequired: true },
      { name: 'High-voltage connector locks and interlocks' },
      { name: 'Insulation resistance', inputType: 'measurement', unit: 'MΩ', minValue: 1, defaultSeverity: 'dangerous' },
      { name: 'Warning labels present and legible' },
    ],
  },
  {
    name: 'Traction battery',
    items: [
      { name: 'State of health', inputType: 'measurement', unit: '%', minValue: 70, defaultSeverity: 'attention' },
      { name: 'Cell voltage spread', inputType: 'measurement', unit: 'mV', maxValue: 100, defaultSeverity: 'attention' },
      { name: 'Battery enclosure and underbody protection', photoRequired: true },
      { name: 'Coolant level and condition' },
      { name: 'Stored battery fault codes', inputType: 'text' },
    ],
  },
  {
    name: 'Charging',
    items: [
      { name: 'Charge port and flap' },
      { name: 'AC charge session', inputType: 'measurement', unit: 'kW' },
      { name: 'DC charge session', inputType: 'measurement', unit: 'kW' },
      { name: 'Charging cable and plug condition' },
      { name: 'Residual current device operation' },
    ],
  },
  {
    name: 'Drivetrain and conventional items',
    items: [
      { name: 'Drive motor noise' },
      { name: 'Reduction gear oil' },
      { name: 'Regenerative braking operation' },
      { name: 'Friction brakes — corrosion from low use', description: 'Regenerative braking leaves discs lightly used; check for scoring and rust.' },
      { name: '12 V auxiliary battery', inputType: 'measurement', unit: 'V', minValue: 12.4, defaultSeverity: 'attention' },
      { name: 'Acoustic vehicle alerting system (AVAS)', description: 'Mandatory on EU-approved electric vehicles.' },
    ],
  },
]

const MARINE: PresetSection[] = [
  {
    name: 'Hull and structure',
    items: [
      { name: 'Hull below the waterline', photoRequired: true },
      { name: 'Keel and skeg' },
      { name: 'Through-hull fittings and seacocks' },
      { name: 'Anodes', inputType: 'measurement', unit: '%', minValue: 50, defaultSeverity: 'attention' },
      { name: 'Rudder and bearings' },
      { name: 'Deck and fittings' },
    ],
  },
  {
    name: 'Propulsion',
    items: [
      { name: 'Engine hours', inputType: 'measurement', unit: 'h', required: true },
      { name: 'Engine oil' },
      { name: 'Gearbox oil' },
      { name: 'Cooling system and impeller' },
      { name: 'Fuel system and filters' },
      { name: 'Propeller and shaft' },
      { name: 'Stern gland' },
      { name: 'Exhaust and water lock' },
    ],
  },
  {
    name: 'Electrical',
    items: [
      { name: 'Starter battery', inputType: 'measurement', unit: 'V', minValue: 12.4, defaultSeverity: 'attention' },
      { name: 'Service battery bank' },
      { name: 'Shore power and galvanic isolator' },
      { name: 'Navigation lights' },
      { name: 'Bilge pumps and float switches', required: true },
    ],
  },
  {
    name: 'Safety equipment',
    description: 'Required equipment varies by flag state and by area of operation.',
    items: [
      { name: 'Life jackets — quantity and service date', inputType: 'measurement', unit: 'pcs', required: true },
      { name: 'Life raft service date', inputType: 'text' },
      { name: 'Fire extinguishers — service date', required: true },
      { name: 'Flares in date' },
      { name: 'VHF radio and DSC' },
      { name: 'EPIRB registration and battery date', inputType: 'text' },
      { name: 'Gas system and locker' },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* The gallery                                                                */
/* -------------------------------------------------------------------------- */

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'eu-roadworthiness',
    name: 'EU periodic technical inspection',
    description:
      'The full Annex I checklist from Directive 2014/45/EU, graded on the minor / major / dangerous defect scale. Thresholds are pre-filled with the common Union figures — adjust them to your national test.',
    country: null,
    standard: 'eu-2014-45',
    standardLabel: 'Directive 2014/45/EU',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'eu-roadworthiness-motorcycle',
    name: 'EU inspection — motorcycles (L category)',
    description:
      'Annex I reduced to the checks that apply to two- and three-wheelers, with tread limits set for L-category vehicles.',
    country: null,
    standard: 'eu-2014-45-l',
    standardLabel: 'Directive 2014/45/EU, L category',
    severityScale: 'eu',
    group: 'regulatory',
    sections: MOTORCYCLE_SECTIONS,
  },
  {
    id: 'no-eu-kontroll',
    name: 'Norway — EU-kontroll',
    description:
      'Annex I with the Norwegian periodic control in mind. Check the current Statens vegvesen limits before issuing certificates.',
    country: 'NO',
    standard: 'eu-2014-45',
    standardLabel: 'EU-kontroll',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'de-hauptuntersuchung',
    name: 'Germany — Hauptuntersuchung',
    description:
      'Annex I arranged for the German main inspection under §29 StVZO. Confirm the current HU-Richtlinie limits before issuing certificates.',
    country: 'DE',
    standard: 'eu-2014-45',
    standardLabel: 'Hauptuntersuchung (§29 StVZO)',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'nl-apk',
    name: 'Netherlands — APK',
    description:
      'Annex I arranged for the Dutch APK. Confirm the current RDW requirements before issuing certificates.',
    country: 'NL',
    standard: 'eu-2014-45',
    standardLabel: 'APK',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'standard-multipoint',
    name: 'Standard multi-point inspection',
    description:
      'A general workshop health check covering the major systems. Graded pass / attention / fail rather than on the EU defect scale.',
    country: null,
    standard: 'custom',
    standardLabel: 'Workshop checklist',
    severityScale: 'basic',
    group: 'workshop',
    sections: STANDARD_MULTIPOINT,
  },
  {
    id: 'pre-purchase',
    name: 'Pre-purchase inspection',
    description:
      'Buyer-facing report covering documentation, body, mechanicals and wear items, with room for measurements and photos.',
    country: null,
    standard: 'custom',
    standardLabel: 'Workshop checklist',
    severityScale: 'basic',
    group: 'workshop',
    sections: PRE_PURCHASE,
  },
  {
    id: 'ev-hybrid',
    name: 'Electric and hybrid vehicle check',
    description:
      'High-voltage safety, traction battery health and charging, plus the conventional items that behave differently on an electrified drivetrain.',
    country: null,
    standard: 'custom',
    standardLabel: 'Specialist checklist',
    severityScale: 'eu',
    group: 'specialist',
    sections: EV_HYBRID,
  },
  {
    id: 'marine',
    name: 'Marine vessel inspection',
    description:
      'Hull, propulsion, electrical and safety equipment for a boat, with engine hours in place of an odometer reading.',
    country: null,
    standard: 'custom',
    standardLabel: 'Specialist checklist',
    severityScale: 'basic',
    group: 'specialist',
    sections: MARINE,
  },
  {
    id: 'blank',
    name: 'Blank template',
    description: 'Start from nothing and build the checklist your workshop actually uses.',
    country: null,
    standard: 'custom',
    standardLabel: 'Empty',
    severityScale: 'basic',
    group: 'workshop',
    sections: [{ name: 'New section', items: [{ name: 'New check' }] }],
  },
]

export const PRESET_GROUPS: { key: TemplatePreset['group']; label: string; description: string }[] = [
  {
    key: 'regulatory',
    label: 'Regulatory',
    description: 'Periodic technical inspection checklists built on Directive 2014/45/EU.',
  },
  {
    key: 'workshop',
    label: 'Workshop',
    description: 'General service and sales checklists that are not tied to a regulation.',
  },
  {
    key: 'specialist',
    label: 'Specialist',
    description: 'Checklists for drivetrains and vessels that need their own procedure.',
  },
]

export function getPreset(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.id === id)
}

export function countPresetItems(preset: TemplatePreset): number {
  return preset.sections.reduce((sum, s) => sum + s.items.length, 0)
}

/**
 * The countries offered in the template settings. `null` covers a checklist
 * that is not tied to one country; the list is not exhaustive and the field
 * accepts anything, so a workshop outside it is not blocked.
 */
export const TEMPLATE_COUNTRIES: { code: string; name: string }[] = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'GB', name: 'United Kingdom' },
]
