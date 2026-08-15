import type { Condition, SeverityScale } from './conditions'

/**
 * Ready-made defect descriptions, so a technician picks the wording instead of
 * retyping it on every inspection.
 *
 * The regulatory entries are the "reasons for failure" from Directive
 * 2014/45/EU Annex I. That table already assigns each reason a category, which
 * is what makes these more than autocomplete: choosing one fills in the note
 * *and* grades the check the way the Directive grades it, so the wording and
 * the severity can never drift apart.
 *
 * Nothing here is binding. A workshop can add its own phrases to any check in
 * the template builder, and whatever it has actually written before is ranked
 * ahead of these — see `rankSuggestions`.
 */

export type DefectSeverity = Extract<Condition, 'attention' | 'fail' | 'dangerous'>

export interface DefectSuggestion {
  text: string
  severity: DefectSeverity
  /** Where the phrase came from, shown so the technician can judge it. */
  source: 'workshop' | 'history' | 'regulation' | 'general'
}

type CatalogueEntry = [text: string, severity: DefectSeverity]

const entries = (source: DefectSuggestion['source'], list: CatalogueEntry[]): DefectSuggestion[] =>
  list.map(([text, severity]) => ({ text, severity, source }))

/* -------------------------------------------------------------------------- */
/* Annex I reasons for failure, by check code                                 */
/* -------------------------------------------------------------------------- */

const BY_CODE: Record<string, CatalogueEntry[]> = {
  // 0. Identification
  '0.1': [
    ['Registration plate missing', 'fail'],
    ['Registration plate insecure or likely to fall off', 'fail'],
    ['Inscription missing, illegible or does not match the vehicle documents', 'fail'],
  ],
  '0.2': [
    ['VIN missing or not to be found', 'fail'],
    ['VIN incomplete, illegible, obviously falsified or does not match the vehicle documents', 'fail'],
    ['Vehicle documents illegible or contain a factual inaccuracy', 'attention'],
  ],

  // 1. Braking equipment
  '1.1.2': [
    ['Excessive travel or insufficient reserve travel of the brake control', 'fail'],
    ['Brake control not releasing correctly', 'attention'],
    ['Anti-slip provision on the brake pedal missing, loose or worn smooth', 'fail'],
  ],
  '1.1.3': [
    ['Pressure build-up time insufficient for effective braking', 'fail'],
    ['Insufficient pressure to assist braking at least twice after the warning has operated', 'dangerous'],
    ['Air or antifreeze leak', 'fail'],
    ['External damage likely to affect the function of the braking system', 'dangerous'],
  ],
  '1.1.4': [
    ['Gauge or indicator malfunctioning or defective', 'attention'],
    ['Low pressure not identifiable', 'fail'],
  ],
  '1.1.6': [
    ['Parking brake control not holding, ratchet locking incorrectly', 'fail'],
    ['Excessive wear at the control pivot or in the ratchet mechanism', 'attention'],
    ['Excessive movement of the control indicating incorrect adjustment', 'attention'],
    ['Actuator missing, damaged or inoperative', 'fail'],
  ],
  '1.1.10': [
    ['Servo unit defective or ineffective', 'fail'],
    ['Servo unit inoperative', 'dangerous'],
    ['Master cylinder defective but brake still operating', 'fail'],
    ['Master cylinder leaking', 'fail'],
    ['Brake fluid reservoir level below the minimum mark', 'attention'],
    ['Brake fluid reservoir cap missing', 'attention'],
  ],
  '1.1.11': [
    ['Imminent risk of failure or fracture of a rigid pipe', 'dangerous'],
    ['Pipes or joints leaking', 'dangerous'],
    ['Pipes damaged or excessively corroded', 'fail'],
    ['Pipe misplaced with a risk of damage', 'fail'],
  ],
  '1.1.12': [
    ['Imminent risk of failure or fracture of a flexible hose', 'dangerous'],
    ['Hoses damaged, chafing, twisted or too short', 'attention'],
    ['Hoses or couplings leaking', 'dangerous'],
    ['Hoses bulging under pressure', 'fail'],
    ['Hoses porous or cord damaged', 'dangerous'],
  ],
  '1.1.13': [
    ['Linings or pads worn down to the wear indicator', 'fail'],
    ['Linings or pads worn beyond the wear indicator, metal to metal contact', 'dangerous'],
    ['Linings or pads contaminated with oil, grease or other material', 'fail'],
    ['Linings or pads contaminated, braking effect seriously reduced', 'dangerous'],
    ['Lining or pad missing or incorrectly mounted', 'dangerous'],
  ],
  '1.1.14': [
    ['Drum or disc excessively worn, scored, cracked, insecure or fractured', 'dangerous'],
    ['Drum or disc contaminated with oil, grease or other material', 'fail'],
    ['Drum or disc contaminated, braking effect seriously reduced', 'dangerous'],
    ['Drum or disc missing', 'dangerous'],
    ['Back plate insecure', 'fail'],
  ],
  '1.1.15': [
    ['Cable damaged or knotted', 'fail'],
    ['Component excessively worn or corroded', 'fail'],
    ['Cable, rod or joint insecure', 'fail'],
    ['Cable guide defective', 'fail'],
    ['Restriction of free movement of the braking system', 'fail'],
  ],
  '1.1.16': [
    ['Actuator cracked or damaged', 'fail'],
    ['Actuator leaking', 'fail'],
    ['Actuator insecure or inadequately mounted', 'fail'],
    ['Actuator severely corroded', 'fail'],
  ],
  '1.1.17': [
    ['Linkage defective', 'fail'],
    ['Linkage incorrectly adjusted', 'fail'],
    ['Valve seized or inoperative', 'fail'],
    ['Valve missing where required', 'dangerous'],
  ],
  '1.1.21': [
    ['Other system device damaged, and the braking system operates adversely', 'fail'],
    ['Air leakage causing a noticeable drop in pressure', 'fail'],
    ['Any component insecure or inadequately mounted', 'fail'],
    ['Unsafe modification to a component', 'fail'],
  ],
  '1.2.1': [
    ['Inadequate braking force at one or more wheels', 'fail'],
    ['No braking force at one or more wheels', 'dangerous'],
    ['Braking force at any wheel less than 70% of the greatest force on the same axle', 'fail'],
    ['Excessive fluctuation in braking force through any full wheel revolution', 'fail'],
    ['Abnormally long delay in the operation of the brakes at any wheel', 'fail'],
  ],
  '1.2.2': [
    ['Braking rate below the minimum required', 'fail'],
    ['Braking rate less than 50% of the required value', 'dangerous'],
  ],
  '1.4.2': [
    ['Parking brake rate below the minimum required', 'fail'],
    ['Parking brake rate less than 50% of the required value', 'dangerous'],
    ['Parking brake does not hold the vehicle on a gradient', 'fail'],
  ],
  '1.6': [
    ['ABS warning device indicates a malfunction', 'fail'],
    ['ABS warning device inoperative', 'fail'],
    ['ABS wheel speed sensor missing or damaged', 'fail'],
    ['ABS wiring damaged', 'fail'],
    ['ABS system inoperative', 'fail'],
  ],
  '1.7': [
    ['EBS warning device indicates a malfunction', 'fail'],
    ['EBS warning device inoperative', 'fail'],
  ],
  '1.8': [
    ['Brake fluid contaminated', 'fail'],
    ['Brake fluid boiling point too low or water content too high', 'fail'],
    ['Brake fluid at or below the minimum level', 'attention'],
  ],

  // 2. Steering
  '2.1': [
    ['Steering box shaft turning stiffly', 'fail'],
    ['Steering box shaft excessively worn', 'fail'],
    ['Excessive movement of the steering box', 'fail'],
    ['Steering box leaking', 'attention'],
    ['Steering box dripping oil', 'fail'],
    ['Steering component insecure, cracked or excessively worn', 'fail'],
    ['Steering component insecure to the point of affecting safety', 'dangerous'],
  ],
  '2.2': [
    ['Relative movement between the steering wheel and the column, indicating looseness', 'fail'],
    ['Steering wheel retaining device missing', 'dangerous'],
    ['Column bearings or couplings excessively worn', 'fail'],
    ['Excessive vertical or radial movement of the steering wheel hub', 'fail'],
    ['Handlebars cracked or insecure on the fork stem', 'dangerous'],
  ],
  '2.3': [
    ['Excessive free play at the steering wheel or handlebars', 'fail'],
    ['Free play so excessive that safe steering is affected', 'dangerous'],
  ],
  '2.4': [
    ['Wheel alignment outside the manufacturer specification', 'attention'],
    ['Alignment causing abnormal or uneven tyre wear', 'fail'],
  ],
  '2.6': [
    ['Power steering system leaking', 'attention'],
    ['Insufficient power steering fluid, below the minimum mark', 'attention'],
    ['Power steering mechanism not functioning', 'fail'],
    ['Power steering mechanism cracked or insecure', 'fail'],
    ['Steering wheel or handlebars misaligned or incompatible with the road wheels', 'fail'],
  ],

  // 3. Visibility
  '3.1': [
    ['Obstruction within the driver field of vision that materially affects the forward or side view', 'fail'],
    ['Obstruction that seriously affects the view through the windscreen', 'dangerous'],
  ],
  '3.2': [
    ['Glass cracked or discoloured', 'attention'],
    ['Cracked or discoloured glass within the swept area of the windscreen', 'fail'],
    ['Glass not conforming to the applicable requirements', 'fail'],
    ['Condition of the glass seriously impairing visibility', 'dangerous'],
    ['Chip within the driver critical vision area', 'fail'],
  ],
  '3.3': [
    ['Mirror or device missing or not fitted as required', 'fail'],
    ['Mirror or device defective, loose or insecure', 'attention'],
    ['Mirror or device with an insufficient field of vision', 'fail'],
  ],
  '3.4': [
    ['Wipers not operating or missing', 'fail'],
    ['Wiper blade defective', 'attention'],
    ['Wiper blade missing or obviously ineffective', 'fail'],
    ['Wiper smearing or juddering across the swept area', 'attention'],
  ],
  '3.5': [
    ['Washers not operating adequately', 'attention'],
    ['Washers not operating at all', 'fail'],
    ['Washer fluid reservoir empty', 'attention'],
  ],
  '3.6': [['Demisting or defrosting system inoperative or clearly not functioning', 'attention']],

  // 4. Lamps, reflectors and electrical equipment
  '4.1.1': [
    ['Light source or lamp defective or missing', 'attention'],
    ['Two light sources or lamps defective or missing', 'fail'],
    ['Projection system slightly defective', 'attention'],
    ['Projection system severely defective or missing', 'fail'],
    ['Lamp insecurely attached', 'attention'],
    ['Lens heavily clouded, reducing light output', 'attention'],
    ['Colour of emitted light not compliant', 'fail'],
  ],
  '4.1.2': [['Headlamp aim outside the required limits', 'attention']],
  '4.2': [
    ['Light source or lamp defective', 'attention'],
    ['Lens defective', 'attention'],
    ['Lamp insecurely attached, with a serious risk of falling off', 'fail'],
    ['Colour of emitted light not compliant', 'fail'],
  ],
  '4.3': [
    ['Stop lamp not operating', 'fail'],
    ['One stop lamp of a pair not operating', 'attention'],
    ['No stop lamp operating at all', 'dangerous'],
    ['Stop lamp operating permanently', 'fail'],
  ],
  '4.4': [
    ['Indicator or hazard lamp not operating', 'fail'],
    ['Flashing rate outside the required range', 'attention'],
    ['Colour of emitted light not compliant', 'fail'],
    ['Indicator tell-tale inoperative', 'attention'],
  ],
  '4.5': [
    ['Fog lamp not operating', 'attention'],
    ['Fog lamp incorrectly aimed', 'attention'],
    ['Rear fog lamp operating permanently', 'attention'],
  ],
  '4.6': [
    ['Reversing lamp not operating', 'attention'],
    ['Reversing lamp operating permanently or showing to the rear when not in reverse', 'fail'],
  ],
  '4.7': [['Registration plate lamp not operating or missing', 'attention']],
  '4.8': [
    ['Reflector defective, damaged or missing', 'attention'],
    ['Conspicuity marking damaged, dirty or partly missing', 'attention'],
    ['Reflector colour not compliant', 'fail'],
  ],
  '4.9': [
    ['Tell-tale not operating', 'attention'],
    ['Tell-tale indicating a malfunction of a safety-related system', 'fail'],
  ],
  '4.10': [
    ['Fixed components insecure or damaged', 'attention'],
    ['Insulation damaged or deteriorated', 'attention'],
    ['Trailer electrical connection not functioning', 'fail'],
  ],
  '4.11': [
    ['Wiring insecure or inadequately secured', 'attention'],
    ['Wiring insulation damaged or deteriorated', 'fail'],
    ['Wiring damaged with a risk of fire or sparking', 'dangerous'],
    ['Excessively deteriorated wiring in the engine bay or near hot components', 'fail'],
  ],
  '4.13': [
    ['Battery insecure', 'attention'],
    ['Battery leaking', 'fail'],
    ['Battery leaking corrosive electrolyte', 'dangerous'],
    ['Battery switch defective', 'fail'],
    ['Battery terminals corroded or loose', 'attention'],
    ['Battery state of charge below the serviceable threshold', 'attention'],
  ],

  // 5. Axles, wheels, tyres and suspension
  '5.1.1': [
    ['Axle cracked or deformed', 'dangerous'],
    ['Axle insecurely attached to the vehicle', 'fail'],
    ['Unsafe modification to an axle', 'dangerous'],
  ],
  '5.1.3': [
    ['Wheel bearing with excessive play', 'fail'],
    ['Wheel bearing too tight or seizing', 'dangerous'],
    ['Wheel bearing noisy under load', 'fail'],
  ],
  '5.2.1': [
    ['Wheel fracture or defective welding', 'dangerous'],
    ['Wheel retaining rings not correctly fitted', 'dangerous'],
    ['Wheel badly distorted or worn', 'fail'],
    ['Wheel nuts or studs missing or loose', 'dangerous'],
    ['Wheel size or type not compatible and affecting road safety', 'fail'],
  ],
  '5.2.3': [
    ['Tread depth below the legal minimum', 'fail'],
    ['Tread wear indicator visible', 'fail'],
    ['Tyre severely damaged or cut', 'fail'],
    ['Tyre cords visible or damaged', 'dangerous'],
    ['Tyres of different size or construction on the same axle', 'fail'],
    ['Tyre load index or speed rating not compliant with the vehicle', 'fail'],
    ['Tyre rubbing against another component', 'attention'],
    ['Tyre seriously rubbing against another component', 'fail'],
    ['Uneven wear across the tread indicating an alignment or suspension fault', 'attention'],
    ['Tyre pressure outside the manufacturer specification', 'attention'],
    ['Tyre perished or showing sidewall cracking with age', 'attention'],
  ],
  '5.3.1': [
    ['Springs insecurely attached to the chassis or axle', 'fail'],
    ['Spring component damaged or cracked', 'fail'],
    ['Spring missing or broken', 'dangerous'],
    ['Stabiliser bar or link worn or insecure', 'fail'],
  ],
  '5.3.2': [
    ['Shock absorbers insecure', 'attention'],
    ['Shock absorbers insecure with a risk of detachment', 'fail'],
    ['Shock absorber damaged, showing signs of severe leakage or malfunction', 'fail'],
    ['Shock absorber missing', 'fail'],
  ],
  '5.3.4': [
    ['Suspension arm, rod or joint excessively worn', 'fail'],
    ['Joint with excessive play, seriously affecting stability', 'dangerous'],
    ['Rubber bush perished, split or missing', 'fail'],
    ['Dust cover split or missing', 'attention'],
    ['Component insecure or badly corroded', 'fail'],
  ],

  // 6. Chassis and chassis attachments
  '6.1.1': [
    ['Slight damage to a member or crossmember', 'attention'],
    ['Serious damage to a member or crossmember', 'fail'],
    ['Insecurity of a member or crossmember', 'fail'],
    ['Excessive corrosion affecting the rigidity of the assembly', 'fail'],
    ['Corrosion perforating a structural or load-bearing member', 'dangerous'],
    ['Unsafe repair or modification to the structure', 'dangerous'],
  ],
  '6.1.2': [
    ['Exhaust system insecure or leaking', 'fail'],
    ['Fumes entering the cab or passenger compartment', 'fail'],
    ['Fumes entering the cab in a quantity dangerous to the health of the occupants', 'dangerous'],
    ['Exhaust silencer defective, missing or bypassed', 'fail'],
  ],
  '6.1.3': [
    ['Fuel tank or pipes insecure', 'fail'],
    ['Fuel leaking or filler cap missing or ineffective', 'fail'],
    ['Fuel leaking with a risk of fire', 'dangerous'],
    ['Fuel pipes chafing or damaged', 'fail'],
    ['Heat shield missing or ineffective', 'fail'],
  ],
  '6.1.6': [['Spare wheel carrier insecure or in an unsatisfactory condition', 'attention']],
  '6.1.7': [
    ['Coupling device damaged, defective or cracked', 'fail'],
    ['Coupling device excessively worn', 'fail'],
    ['Coupling device defective to the point of risking detachment', 'dangerous'],
    ['Safety device missing, damaged or not functioning', 'fail'],
  ],
  '6.2.1': [
    ['Panel or component loose or damaged, likely to cause injury', 'fail'],
    ['Body pillar insecure', 'fail'],
    ['Ingress of engine or exhaust fumes', 'dangerous'],
    ['Corrosion in an area that could injure an occupant or another road user', 'fail'],
    ['Sharp edge or protrusion likely to cause injury', 'fail'],
  ],
  '6.2.3': [
    ['Door or hatch does not open or close properly', 'fail'],
    ['Door or hatch liable to open unintentionally or fails to stay closed', 'dangerous'],
    ['Door, hinge, catch or pillar deteriorated', 'attention'],
  ],
  '6.2.4': [
    ['Floor insecure or badly deteriorated', 'fail'],
    ['Floor insufficiently secure to be safe to stand on', 'dangerous'],
  ],
  '6.2.5': [
    ['Seat with a defective structure', 'fail'],
    ['Seat insecurely mounted', 'dangerous'],
    ['Seat adjustment mechanism not functioning correctly', 'fail'],
  ],
  '6.2.7': [
    ['Step or foot rest insecure', 'attention'],
    ['Step insecure to the point of risking injury', 'fail'],
  ],
  '6.2.11': [
    ['Mudguard missing, loose or badly corroded', 'attention'],
    ['Insufficient clearance to the wheel or spray suppression ineffective', 'attention'],
  ],

  // 7. Other equipment
  '7.1': [
    ['Belt anchorage badly deteriorated', 'fail'],
    ['Anchorage deteriorated to the point of affecting stability', 'dangerous'],
    ['Belt damaged, with a cut or sign of overstretching', 'fail'],
    ['Belt frayed or dirty but serviceable', 'attention'],
    ['Belt retractor or buckle not operating correctly', 'fail'],
    ['Belt missing where one is required', 'fail'],
    ['Airbag or SRS warning lamp indicates a system failure', 'fail'],
  ],
  '7.2': [
    ['Fire extinguisher missing where required', 'attention'],
    ['Fire extinguisher out of service date or discharged', 'attention'],
    ['Fire extinguisher not securely mounted', 'attention'],
  ],
  '7.3': [
    ['Device not functioning to prevent the vehicle being driven away', 'attention'],
    ['Device defective or locking unintentionally', 'fail'],
  ],
  '7.4': [['Warning triangle missing or incomplete', 'attention']],
  '7.5': [['First aid kit missing, incomplete or out of date', 'attention']],
  '7.7': [
    ['Audible warning device not working at all', 'fail'],
    ['Control insecure or device sounding intermittently', 'attention'],
    ['Tone not compliant or clearly inadequate', 'attention'],
  ],
  '7.8': [
    ['Speedometer not fitted where required', 'fail'],
    ['Speedometer not functioning', 'attention'],
    ['Speedometer not illuminated', 'attention'],
  ],
  '7.9': [
    ['Tachograph missing where required', 'fail'],
    ['Tachograph not functioning or seals broken', 'fail'],
    ['Tachograph calibration plate missing, illegible or out of date', 'fail'],
    ['Obvious evidence of tampering or manipulation', 'fail'],
  ],
  '7.10': [
    ['Speed limitation device missing where required', 'fail'],
    ['Speed limitation device evidently not functioning', 'fail'],
    ['Speed limitation device set to the wrong speed or seals missing', 'fail'],
  ],
  '7.11': [
    ['Odometer obviously manipulated to misrepresent the mileage', 'fail'],
    ['Odometer obviously not functioning', 'attention'],
  ],
  '7.12': [
    ['ESC wheel speed sensor missing or damaged', 'fail'],
    ['ESC wiring damaged', 'fail'],
    ['ESC warning device indicates a malfunction', 'fail'],
    ['ESC system inoperative', 'fail'],
  ],

  // 8. Nuisance
  '8.1': [
    ['Noise level exceeding the permitted level', 'fail'],
    ['Part of the noise suppression system loose, damaged, missing or obviously modified', 'fail'],
    ['Part of the noise suppression system likely to increase the noise level', 'dangerous'],
  ],
  '8.2.1.2': [
    ['CO content exceeding the permitted level', 'fail'],
    ['Lambda outside the range 1 ± 0.03 or not to the manufacturer specification', 'fail'],
    ['Emission control equipment missing, modified or obviously defective', 'fail'],
    ['Engine management indicating a serious malfunction', 'fail'],
  ],
  '8.2.2.1': [
    ['Emission control equipment missing or obviously defective', 'fail'],
    ['Diesel particulate filter obviously modified or removed', 'fail'],
    ['EGR or SCR system obviously defective or bypassed', 'fail'],
  ],
  '8.2.2.2': [
    ['Smoke opacity exceeding the level recorded on the manufacturer plate', 'fail'],
    ['Excessive smoke obscuring the view of other road users', 'dangerous'],
    ['Smoke opacity exceeding the applicable limit', 'fail'],
  ],
  '8.5': [
    ['Excessive fluid leak likely to harm the environment or endanger other road users', 'fail'],
    ['Constant formation of drops presenting a very serious risk', 'dangerous'],
    ['Seepage or weeping without dripping', 'attention'],
  ],
}

/* -------------------------------------------------------------------------- */
/* Section-level fallbacks, for codes without an entry of their own           */
/* -------------------------------------------------------------------------- */

const BY_SECTION: Record<string, CatalogueEntry[]> = {
  '1': [
    ['Component excessively worn', 'fail'],
    ['Component insecure or inadequately mounted', 'fail'],
    ['Leak from the braking system', 'fail'],
    ['Braking performance reduced', 'fail'],
  ],
  '2': [
    ['Excessive play in the steering', 'fail'],
    ['Component worn, insecure or damaged', 'fail'],
    ['Leak from the steering system', 'attention'],
  ],
  '3': [
    ['Visibility impaired', 'fail'],
    ['Component defective, missing or ineffective', 'attention'],
  ],
  '4': [
    ['Lamp not operating', 'fail'],
    ['Lamp defective, damaged or insecure', 'attention'],
    ['Colour of emitted light not compliant', 'fail'],
  ],
  '5': [
    ['Component excessively worn', 'fail'],
    ['Component insecure or damaged', 'fail'],
    ['Excessive play', 'fail'],
  ],
  '6': [
    ['Corrosion affecting the structure', 'fail'],
    ['Component insecure, loose or damaged', 'fail'],
    ['Leak from the system', 'fail'],
  ],
  '7': [
    ['Equipment missing where required', 'fail'],
    ['Equipment defective or not functioning', 'fail'],
    ['Equipment out of service date', 'attention'],
  ],
  '8': [
    ['Emission or noise level exceeding the permitted limit', 'fail'],
    ['Control equipment missing, modified or defective', 'fail'],
    ['Fluid leak', 'attention'],
  ],
}

/* -------------------------------------------------------------------------- */
/* Keyword fallbacks, for checklists that carry no regulation codes           */
/* -------------------------------------------------------------------------- */

const BY_KEYWORD: { match: RegExp; suggestions: CatalogueEntry[] }[] = [
  {
    match: /\b(pad|disc|drum|brake|caliper)\b/i,
    suggestions: [
      ['Worn close to the minimum thickness, replacement due soon', 'attention'],
      ['Worn below the minimum thickness', 'fail'],
      ['Scored, cracked or corroded', 'fail'],
      ['Contaminated with oil or grease', 'fail'],
      ['Seized or binding', 'fail'],
    ],
  },
  {
    match: /\b(tyre|tire|tread|wheel)\b/i,
    suggestions: [
      ['Tread approaching the legal minimum', 'attention'],
      ['Tread below the legal minimum', 'fail'],
      ['Uneven or edge wear', 'attention'],
      ['Sidewall damage, bulge or cut', 'dangerous'],
      ['Perished with age or cracking', 'attention'],
      ['Pressure incorrect', 'attention'],
    ],
  },
  {
    match: /\b(oil|coolant|fluid|leak|grease)\b/i,
    suggestions: [
      ['Level low, topped up', 'attention'],
      ['Seepage, no dripping', 'attention'],
      ['Active leak, dripping', 'fail'],
      ['Fluid contaminated or overdue for replacement', 'attention'],
    ],
  },
  {
    match: /\b(lamp|light|bulb|headlamp|indicator|beam)\b/i,
    suggestions: [
      ['Bulb blown', 'fail'],
      ['Lens cracked, clouded or discoloured', 'attention'],
      ['Aim incorrect', 'attention'],
      ['Insecure or water ingress', 'attention'],
    ],
  },
  {
    match: /\b(belt|hose|pipe)\b/i,
    suggestions: [
      ['Perished, cracked or glazed', 'attention'],
      ['Chafing against an adjacent component', 'fail'],
      ['Split or leaking', 'fail'],
      ['Tension incorrect', 'attention'],
    ],
  },
  {
    match: /\b(battery|charge|voltage|alternator)\b/i,
    suggestions: [
      ['State of charge low', 'attention'],
      ['Terminals corroded or loose', 'attention'],
      ['Fails a load test, replacement due', 'fail'],
      ['Casing damaged or leaking', 'fail'],
    ],
  },
  {
    match: /\b(suspension|shock|damper|spring|bush|joint|bearing)\b/i,
    suggestions: [
      ['Excessive play', 'fail'],
      ['Bush perished or split', 'fail'],
      ['Leaking or ineffective', 'fail'],
      ['Corroded or insecure', 'fail'],
      ['Noisy under load', 'attention'],
    ],
  },
  {
    match: /\b(exhaust|emission|smoke|silencer|dpf|catalyst)\b/i,
    suggestions: [
      ['Blowing at a joint', 'fail'],
      ['Corroded, repair due soon', 'attention'],
      ['Mounting perished or insecure', 'attention'],
      ['Emissions above the limit', 'fail'],
    ],
  },
  {
    match: /\b(wiper|washer|screen|windscreen|glass|mirror)\b/i,
    suggestions: [
      ['Blade smearing or juddering', 'attention'],
      ['Chip or crack outside the swept area', 'attention'],
      ['Chip or crack in the driver vision area', 'fail'],
      ['Washer jet blocked or misaligned', 'attention'],
    ],
  },
  {
    match: /\b(filter|air|cabin|pollen)\b/i,
    suggestions: [
      ['Dirty, replacement recommended', 'attention'],
      ['Heavily contaminated, replacement due', 'fail'],
    ],
  },
]

/** Always offered, so there is a phrase to hand even for an unusual check. */
const GENERAL: CatalogueEntry[] = [
  ['Worn, within limits, monitor at next service', 'attention'],
  ['Worn beyond the serviceable limit', 'fail'],
  ['Damaged', 'fail'],
  ['Corroded', 'attention'],
  ['Insecure or loose', 'fail'],
  ['Leaking', 'fail'],
  ['Missing', 'fail'],
  ['Not working', 'fail'],
  ['Excessive play', 'fail'],
  ['Advisory only, no action needed yet', 'attention'],
]

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

export interface SuggestionCheck {
  name: string
  code?: string | null
  sectionCode?: string | null
  /** Phrases the workshop configured on this check in the template builder. */
  defectSuggestions?: string[] | null
}

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** Catalogue entries for a check, most specific source first. */
function catalogueFor(check: SuggestionCheck): DefectSuggestion[] {
  const found: DefectSuggestion[] = []

  const code = check.code?.trim()
  if (code) {
    if (BY_CODE[code]) found.push(...entries('regulation', BY_CODE[code]))

    // "1.1.13" has no entry of its own → try "1.1", then "1". A template can
    // reference a check at whatever depth suits it and still get useful text.
    const parts = code.split('.')
    for (let i = parts.length - 1; i > 0 && found.length === 0; i--) {
      const parent = parts.slice(0, i).join('.')
      if (BY_CODE[parent]) found.push(...entries('regulation', BY_CODE[parent]))
    }
  }

  const section = (check.sectionCode ?? code ?? '').split('.')[0]
  if (BY_SECTION[section]) found.push(...entries('regulation', BY_SECTION[section]))

  for (const { match, suggestions } of BY_KEYWORD) {
    if (match.test(check.name)) found.push(...entries('general', suggestions))
  }

  found.push(...entries('general', GENERAL))
  return found
}

/**
 * Suggestions for one check, best first.
 *
 * Order is deliberate: what the workshop configured, then what it has actually
 * written before, then the regulation, then general phrasing. A shop that has
 * settled on its own wording sees that wording at the front, and never has to
 * scroll past a Directive quotation to find it.
 *
 * `preferred` floats phrases matching the grade the technician just picked to
 * the top without hiding the others, so the list still shows that the same
 * fault can be minor or dangerous depending on how far gone it is.
 */
export function rankSuggestions(
  check: SuggestionCheck,
  {
    scale = 'eu',
    history = [],
    preferred,
  }: {
    scale?: SeverityScale
    /** Phrases this organization has used before on this check, most used first. */
    history?: { text: string; severity: DefectSeverity }[]
    preferred?: Condition
  } = {}
): DefectSuggestion[] {
  const workshop = (check.defectSuggestions ?? [])
    .map((text) => text.trim())
    .filter(Boolean)
    // A configured phrase has no severity of its own; it takes the grade the
    // technician already chose, defaulting to a major defect.
    .map<DefectSuggestion>((text) => ({
      text,
      severity: isDefectSeverity(preferred) ? preferred : 'fail',
      source: 'workshop',
    }))

  const past = history.map<DefectSuggestion>((h) => ({
    text: h.text,
    severity: h.severity,
    source: 'history',
  }))

  const all = [...workshop, ...past, ...catalogueFor(check)]

  const seen = new Set<string>()
  const deduped = all.filter((s) => {
    const key = normalise(s.text)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // The dangerous category only exists on the EU scale.
  const scoped = scale === 'basic' ? deduped.filter((s) => s.severity !== 'dangerous') : deduped

  if (!isDefectSeverity(preferred)) return scoped
  return [
    ...scoped.filter((s) => s.severity === preferred),
    ...scoped.filter((s) => s.severity !== preferred),
  ]
}

export function isDefectSeverity(value: unknown): value is DefectSeverity {
  return value === 'attention' || value === 'fail' || value === 'dangerous'
}
