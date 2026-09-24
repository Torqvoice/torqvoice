import type { Condition, InputType, SeverityScale } from './conditions'
import { EN_LIBRARY, type InspectionLibrary, libraryText } from './inspectionLibrary'
import { NO_SECTIONS, NO_STANDARD } from './norwayControlPoints'

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

/**
 * Presets carry message keys, not text. The words live in
 * `messages/<locale>/inspectionLibrary.json`, so a checklist is installed in
 * the workshop's own language; `resolvePreset` turns keys into text.
 */
export interface PresetItem {
  /** Key into the library's `checks` table. */
  key: string
  code?: string
  /** Key into the library's `descriptions` table. */
  descriptionKey?: string
  inputType?: InputType
  unit?: string
  minValue?: number
  maxValue?: number
  /** Keys into the library's `choices` table. */
  choices?: string[]
  required?: boolean
  photoRequired?: boolean
  /** May be graded "not applicable": not every vehicle has the part. */
  allowNotApplicable?: boolean
  defaultSeverity?: Extract<Condition, 'attention' | 'fail' | 'dangerous'>
}

export interface PresetSection {
  /** Key into the library's `sections` table. */
  key: string
  code?: string
  descriptionKey?: string
  items: PresetItem[]
}

export interface TemplatePreset {
  /** Also the key of its name, description and badge in the library's `presets` table. */
  id: string
  /** ISO-3166 alpha-2, or null when the preset is not tied to one country. */
  country: string | null
  /** Regime the checklist follows; shown as a badge in the gallery. */
  standard: string
  severityScale: SeverityScale
  /** Used to group the gallery. */
  group: 'regulatory' | 'workshop' | 'specialist'
  sections: PresetSection[]
}

export interface ResolvedPresetItem extends Omit<PresetItem, 'descriptionKey'> {
  name: string
  description?: string
}

export interface ResolvedPresetSection extends Omit<PresetSection, 'descriptionKey' | 'items'> {
  name: string
  description?: string
  items: ResolvedPresetItem[]
}

/** A preset with its text in one language. */
export interface ResolvedPreset extends Omit<TemplatePreset, 'sections'> {
  name: string
  description: string
  standardLabel: string
  sections: ResolvedPresetSection[]
}

/* -------------------------------------------------------------------------- */
/* Directive 2014/45/EU — Annex I categories 0 to 8                           */
/* -------------------------------------------------------------------------- */

const EU_IDENTIFICATION: PresetSection = {
  key: 'identificationVehicle',
  code: '0',
  descriptionKey: 'annexIItem0ConfirmsVehicle',
  items: [
    { key: 'registrationPlates', code: '0.1', required: true },
    {
      key: 'vehicleIdentificationChassisNumber',
      code: '0.2',
      descriptionKey: 'vinPresentLegibleMatchingRegistrationDocument',
      required: true,
    },
  ],
}

const EU_BRAKING: PresetSection = {
  key: 'brakingEquipment',
  code: '1',
  descriptionKey: 'annexIItem1MechanicalCondition',
  items: [
    { key: 'serviceBrakePedalHandLeverPivot', code: '1.1.1' },
    { key: 'pedalLeverConditionTravel', code: '1.1.2' },
    { key: 'vacuumPumpCompressorReservoirs', code: '1.1.3' },
    { key: 'lowPressureWarningGaugeIndicator', code: '1.1.4' },
    { key: 'parkingBrakeActuatorLeverRatchet', code: '1.1.6' },
    { key: 'brakeValves', code: '1.1.7' },
    { key: 'brakeServoUnitMasterCylinder', code: '1.1.10' },
    { key: 'rigidBrakePipes', code: '1.1.11', photoRequired: false },
    { key: 'flexibleBrakeHoses', code: '1.1.12' },
    {
      key: 'brakeLiningsPads',
      code: '1.1.13',
      descriptionKey: 'remainingFrictionMaterialThinnestPoint',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 3,
      defaultSeverity: 'fail',
    },
    { key: 'brakeDrumsDiscs', code: '1.1.14' },
    { key: 'brakeCablesRodsLeversLinkages', code: '1.1.15' },
    { key: 'brakeActuators', code: '1.1.16' },
    { key: 'loadSensingValve', code: '1.1.17' },
    { key: 'completeBrakingSystem', code: '1.1.21' },
    {
      key: 'serviceBrakeEfficiency',
      code: '1.2.2',
      descriptionKey: 'brakingRateAsPercentageMaximumAuthorised',
      inputType: 'measurement',
      unit: '%',
      minValue: 50,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      key: 'serviceBrakeImbalanceAcrossAxle',
      code: '1.2.1',
      descriptionKey: 'differenceBetweenBrakingForcesTwoWheels',
      inputType: 'measurement',
      unit: '%',
      maxValue: 30,
      defaultSeverity: 'fail',
    },
    {
      key: 'parkingBrakeEfficiency',
      code: '1.4.2',
      inputType: 'measurement',
      unit: '%',
      minValue: 16,
      required: true,
      defaultSeverity: 'fail',
    },
    { key: 'antiLockBrakingSystemAbs', code: '1.6' },
    { key: 'electronicBrakingSystemEbs', code: '1.7' },
    { key: 'brakeFluid', code: '1.8', descriptionKey: 'contaminationBoilingPoint' },
  ],
}

const EU_STEERING: PresetSection = {
  key: 'steering',
  code: '2',
  descriptionKey: 'annexIItem2',
  items: [
    { key: 'mechanicalConditionSteering', code: '2.1' },
    { key: 'steeringWheelColumnHandlebars', code: '2.2' },
    {
      key: 'steeringPlay',
      code: '2.3',
      descriptionKey: 'freeMovementRimBeforeRoadWheels',
      inputType: 'measurement',
      unit: 'mm',
      maxValue: 120,
      defaultSeverity: 'fail',
    },
    { key: 'wheelAlignment', code: '2.4' },
    { key: 'powerSteering', code: '2.6' },
  ],
}

const EU_VISIBILITY: PresetSection = {
  key: 'visibility',
  code: '3',
  descriptionKey: 'annexIItem3',
  items: [
    { key: 'fieldVision', code: '3.1' },
    {
      key: 'conditionGlass',
      code: '3.2',
      descriptionKey: 'chipsCracksSweptAreaWindscreen',
    },
    { key: 'rearViewMirrorsDevices', code: '3.3' },
    { key: 'windscreenWipers', code: '3.4' },
    { key: 'windscreenWashers', code: '3.5' },
    { key: 'demistingDefrostingSystem', code: '3.6' },
  ],
}

const EU_LIGHTING: PresetSection = {
  key: 'lampsReflectorsElectricalEquipment',
  code: '4',
  descriptionKey: 'annexIItem4',
  items: [
    { key: 'headlampsConditionOperation', code: '4.1.1' },
    {
      key: 'headlampAim',
      code: '4.1.2',
      descriptionKey: 'downwardInclinationDippedBeam',
      inputType: 'measurement',
      unit: '%',
      minValue: -2.5,
      maxValue: -0.5,
      defaultSeverity: 'attention',
    },
    { key: 'positionSideMarkerDaytimeRunningLamps', code: '4.2' },
    { key: 'stopLamps', code: '4.3', required: true },
    { key: 'directionIndicatorHazardWarningLamps', code: '4.4' },
    { key: 'frontRearFogLamps', code: '4.5' },
    { key: 'reversingLamps', code: '4.6' },
    { key: 'rearRegistrationPlateLamp', code: '4.7' },
    { key: 'retroReflectorsConspicuityMarkings', code: '4.8' },
    { key: 'tellTales', code: '4.9' },
    { key: 'electricalConnectionsTrailer', code: '4.10' },
    { key: 'electricalWiring', code: '4.11' },
    { key: 'battery', code: '4.13' },
  ],
}

const EU_RUNNING_GEAR: PresetSection = {
  key: 'axlesWheelsTyresSuspension',
  code: '5',
  descriptionKey: 'annexIItem5TreadDepth',
  items: [
    { key: 'axles', code: '5.1.1' },
    { key: 'stubAxlesWheelBearings', code: '5.1.3' },
    { key: 'wheels', code: '5.2.1' },
    { key: 'tyreConditionSidewallsLoadSpeedRating', code: '5.2.3' },
    {
      key: 'treadDepthFrontLeft',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      key: 'treadDepthFrontRight',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      key: 'treadDepthRearLeft',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    {
      key: 'treadDepthRearRight',
      code: '5.2.3',
      inputType: 'measurement',
      unit: 'mm',
      minValue: 1.6,
      required: true,
      defaultSeverity: 'fail',
    },
    { key: 'springsStabiliser', code: '5.3.1' },
    { key: 'shockAbsorbers', code: '5.3.2' },
    { key: 'suspensionArmsRodsJoints', code: '5.3.4' },
  ],
}

const EU_CHASSIS: PresetSection = {
  key: 'chassisChassisAttachments',
  code: '6',
  descriptionKey: 'annexIItem6',
  items: [
    { key: 'chassisFrameAttachments', code: '6.1.1' },
    { key: 'exhaustPipesSilencer', code: '6.1.2' },
    { key: 'fuelTankPipes', code: '6.1.3' },
    { key: 'spareWheelCarrier', code: '6.1.6' },
    { key: 'couplingDeviceTowingEquipment', code: '6.1.7' },
    { key: 'cabBodyworkCondition', code: '6.2.1' },
    { key: 'doorsDoorCatches', code: '6.2.3' },
    { key: 'floor', code: '6.2.4' },
    { key: 'driverSeatSeats', code: '6.2.5' },
    { key: 'steps', code: '6.2.7' },
    { key: 'mudguardsSpraySuppression', code: '6.2.11' },
  ],
}

const EU_OTHER_EQUIPMENT: PresetSection = {
  key: 'otherEquipment',
  code: '7',
  descriptionKey: 'annexIItem7SomeChecks',
  items: [
    { key: 'safetyBeltsBucklesRestraintSystems', code: '7.1', required: true },
    { key: 'fireExtinguisher', code: '7.2' },
    { key: 'locksAntiTheftDevice', code: '7.3' },
    { key: 'warningTriangle', code: '7.4' },
    { key: 'firstAidKit', code: '7.5' },
    { key: 'audibleWarningDevice', code: '7.7' },
    { key: 'speedometer', code: '7.8' },
    { key: 'tachograph', code: '7.9' },
    { key: 'speedLimitationDevice', code: '7.10' },
    {
      key: 'odometerReading',
      code: '7.11',
      descriptionKey: 'readingTimeTestAnnexIvRequires',
      inputType: 'measurement',
      unit: 'km',
      required: true,
    },
    { key: 'electronicStabilityControlEsc', code: '7.12' },
  ],
}

const EU_NUISANCE: PresetSection = {
  key: 'nuisance',
  code: '8',
  descriptionKey: 'annexIItem8EmissionsNoise',
  items: [
    { key: 'noiseSuppressionSystem', code: '8.1' },
    {
      key: 'petrolCoIdle',
      code: '8.2.1.2',
      inputType: 'measurement',
      unit: '%',
      maxValue: 0.5,
      defaultSeverity: 'fail',
    },
    {
      key: 'petrolLambdaHighIdle',
      code: '8.2.1.2',
      inputType: 'measurement',
      minValue: 0.97,
      maxValue: 1.03,
      defaultSeverity: 'fail',
    },
    {
      key: 'dieselSmokeOpacity',
      code: '8.2.2.2',
      descriptionKey: 'absorptionCoefficientFromFreeAccelerationTest',
      inputType: 'measurement',
      unit: 'm⁻¹',
      maxValue: 1.5,
      defaultSeverity: 'fail',
    },
    {
      key: 'exhaustAfterTreatmentSystem',
      code: '8.2.2.1',
      descriptionKey: 'dpfEgrScrPresentUnmodified',
    },
    { key: 'fluidLeaks', code: '8.5', defaultSeverity: 'attention' },
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
    .filter((item) => item.key !== 'treadDepthRearRight' && item.key !== 'treadDepthFrontRight')
    .map((item) =>
      item.key === 'treadDepthFrontLeft'
        ? { ...item, key: 'treadDepthFrontTyre', minValue: 1 }
        : item.key === 'treadDepthRearLeft'
          ? { ...item, key: 'treadDepthRearTyre', minValue: 1 }
          : item
    ),
})).filter((section) => section.items.length > 0)

/* -------------------------------------------------------------------------- */
/* Non-regulatory workshop checklists                                         */
/* -------------------------------------------------------------------------- */

const STANDARD_MULTIPOINT: PresetSection[] = [
  {
    key: 'exterior',
    items: [
      { key: 'bodyCondition' },
      { key: 'paint' },
      { key: 'lights' },
      { key: 'windscreen' },
      { key: 'wipers' },
      { key: 'mirrors' },
    ],
  },
  {
    key: 'underHood',
    items: [
      { key: 'engineOilLevelCondition' },
      {
        key: 'coolant',
        inputType: 'measurement',
        unit: '°C',
        maxValue: -20,
        defaultSeverity: 'attention',
      },
      { key: 'brakeFluid' },
      { key: 'powerSteeringFluid' },
      {
        key: 'batteryVoltage',
        inputType: 'measurement',
        unit: 'V',
        minValue: 12.4,
        defaultSeverity: 'attention',
      },
      { key: 'driveBelts' },
      { key: 'hoses' },
      { key: 'airFilter' },
      { key: 'cabinFilter' },
    ],
  },
  {
    key: 'underVehicle',
    items: [
      { key: 'exhaustSystem' },
      { key: 'suspension' },
      { key: 'cvJointsBoots' },
      { key: 'brakeLines' },
      { key: 'fluidLeaks' },
    ],
  },
  {
    key: 'brakes',
    items: [
      {
        key: 'frontPads',
        inputType: 'measurement',
        unit: 'mm',
        minValue: 3,
        defaultSeverity: 'fail',
      },
      {
        key: 'rearPads',
        inputType: 'measurement',
        unit: 'mm',
        minValue: 3,
        defaultSeverity: 'fail',
      },
      { key: 'discs' },
      { key: 'parkingBrake' },
    ],
  },
  {
    key: 'tyres',
    items: [
      {
        key: 'treadDepthFrontLeft',
        inputType: 'measurement',
        unit: 'mm',
        minValue: 1.6,
        defaultSeverity: 'fail',
      },
      {
        key: 'treadDepthFrontRight',
        inputType: 'measurement',
        unit: 'mm',
        minValue: 1.6,
        defaultSeverity: 'fail',
      },
      {
        key: 'treadDepthRearLeft',
        inputType: 'measurement',
        unit: 'mm',
        minValue: 1.6,
        defaultSeverity: 'fail',
      },
      {
        key: 'treadDepthRearRight',
        inputType: 'measurement',
        unit: 'mm',
        minValue: 1.6,
        defaultSeverity: 'fail',
      },
      {
        key: 'tyrePressure',
        inputType: 'measurement',
        unit: 'bar',
        minValue: 1.8,
        maxValue: 3.5,
        defaultSeverity: 'attention',
      },
      { key: 'spareTyreRepairKit' },
    ],
  },
  {
    key: 'interior',
    items: [
      { key: 'warningLights' },
      { key: 'horn' },
      { key: 'airConditioning' },
      { key: 'heater' },
      { key: 'seatBelts' },
    ],
  },
]

const PRE_PURCHASE: PresetSection[] = [
  {
    key: 'documentationHistory',
    items: [
      { key: 'registrationDocumentMatchesVehicle', required: true },
      { key: 'vin', inputType: 'text', required: true },
      { key: 'serviceHistory', inputType: 'choice', choices: ['full', 'partial', 'none'] },
      { key: 'outstandingRecalls' },
      { key: 'previousAccidentDamage' },
    ],
  },
  {
    key: 'bodyPaint',
    items: [
      { key: 'panelGaps' },
      {
        key: 'paintThicknessWorstPanel',
        inputType: 'measurement',
        unit: 'µm',
        minValue: 80,
        maxValue: 200,
        defaultSeverity: 'attention',
      },
      { key: 'corrosion', photoRequired: true },
      { key: 'glassLights' },
    ],
  },
  {
    key: 'mechanical',
    items: [
      { key: 'coldStart' },
      { key: 'engineNoise' },
      {
        key: 'compressionLowestCylinder',
        inputType: 'measurement',
        unit: 'bar',
        minValue: 10,
        defaultSeverity: 'fail',
      },
      { key: 'gearboxClutch' },
      { key: 'faultCodesDiagnosticPort', inputType: 'text' },
      { key: 'roadTest' },
    ],
  },
  {
    key: 'wearItems',
    items: [
      { key: 'brakePadsDiscs' },
      { key: 'tyresIncludingDateCodes' },
      { key: 'suspensionBushes' },
      { key: 'exhaust' },
    ],
  },
]

const EV_HYBRID: PresetSection[] = [
  {
    key: 'highVoltageSafety',
    descriptionKey: 'carryOutHighVoltageSystemIsolated',
    items: [
      { key: 'serviceDisconnectIsolationProcedureFollowed', required: true },
      { key: 'orangeHighVoltageCablingChafingDamage', photoRequired: true },
      { key: 'highVoltageConnectorLocksInterlocks' },
      {
        key: 'insulationResistance',
        inputType: 'measurement',
        unit: 'MΩ',
        minValue: 1,
        defaultSeverity: 'dangerous',
      },
      { key: 'warningLabelsPresentLegible' },
    ],
  },
  {
    key: 'tractionBattery',
    items: [
      {
        key: 'stateHealth',
        inputType: 'measurement',
        unit: '%',
        minValue: 70,
        defaultSeverity: 'attention',
      },
      {
        key: 'cellVoltageSpread',
        inputType: 'measurement',
        unit: 'mV',
        maxValue: 100,
        defaultSeverity: 'attention',
      },
      { key: 'batteryEnclosureUnderbodyProtection', photoRequired: true },
      { key: 'coolantLevelCondition' },
      { key: 'storedBatteryFaultCodes', inputType: 'text' },
    ],
  },
  {
    key: 'charging',
    items: [
      { key: 'chargePortFlap' },
      { key: 'acChargeSession', inputType: 'measurement', unit: 'kW' },
      { key: 'dcChargeSession', inputType: 'measurement', unit: 'kW' },
      { key: 'chargingCablePlugCondition' },
      { key: 'residualCurrentDeviceOperation' },
    ],
  },
  {
    key: 'drivetrainConventionalItems',
    items: [
      { key: 'driveMotorNoise' },
      { key: 'reductionGearOil' },
      { key: 'regenerativeBrakingOperation' },
      {
        key: 'frictionBrakesCorrosionFromLowUse',
        descriptionKey: 'regenerativeBrakingLeavesDiscsLightlyUsed',
      },
      {
        key: 'n12VAuxiliaryBattery',
        inputType: 'measurement',
        unit: 'V',
        minValue: 12.4,
        defaultSeverity: 'attention',
      },
      {
        key: 'acousticVehicleAlertingSystemAvas',
        descriptionKey: 'mandatoryEuApprovedElectricVehicles',
      },
    ],
  },
]

const MARINE: PresetSection[] = [
  {
    key: 'hullStructure',
    items: [
      { key: 'hullBelowWaterline', photoRequired: true },
      { key: 'keelSkeg' },
      { key: 'throughHullFittingsSeacocks' },
      {
        key: 'anodes',
        inputType: 'measurement',
        unit: '%',
        minValue: 50,
        defaultSeverity: 'attention',
      },
      { key: 'rudderBearings' },
      { key: 'deckFittings' },
    ],
  },
  {
    key: 'propulsion',
    items: [
      { key: 'engineHours', inputType: 'measurement', unit: 'h', required: true },
      { key: 'engineOil' },
      { key: 'gearboxOil' },
      { key: 'coolingSystemImpeller' },
      { key: 'fuelSystemFilters' },
      { key: 'propellerShaft' },
      { key: 'sternGland' },
      { key: 'exhaustWaterLock' },
    ],
  },
  {
    key: 'electrical',
    items: [
      {
        key: 'starterBattery',
        inputType: 'measurement',
        unit: 'V',
        minValue: 12.4,
        defaultSeverity: 'attention',
      },
      { key: 'serviceBatteryBank' },
      { key: 'shorePowerGalvanicIsolator' },
      { key: 'navigationLights' },
      { key: 'bilgePumpsFloatSwitches', required: true },
    ],
  },
  {
    key: 'safetyEquipment',
    descriptionKey: 'requiredEquipmentVariesFlagStateArea',
    items: [
      {
        key: 'lifeJacketsQuantityServiceDate',
        inputType: 'measurement',
        unit: 'pcs',
        required: true,
      },
      { key: 'lifeRaftServiceDate', inputType: 'text' },
      { key: 'fireExtinguishersServiceDate', required: true },
      { key: 'flaresDate' },
      { key: 'vhfRadioDsc' },
      { key: 'epirbRegistrationBatteryDate', inputType: 'text' },
      { key: 'gasSystemLocker' },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* The gallery                                                                */
/* -------------------------------------------------------------------------- */

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'eu-roadworthiness',
    country: null,
    standard: 'eu-2014-45',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'eu-roadworthiness-motorcycle',
    country: null,
    standard: 'eu-2014-45-l',
    severityScale: 'eu',
    group: 'regulatory',
    sections: MOTORCYCLE_SECTIONS,
  },
  {
    id: 'no-eu-kontroll',
    country: 'NO',
    // Statens vegvesen's own instruks, not the Directive's Annex: Norway
    // numbers, words and grades its control points differently.
    standard: NO_STANDARD,
    severityScale: 'eu',
    group: 'regulatory',
    sections: NO_SECTIONS,
  },
  {
    id: 'de-hauptuntersuchung',
    country: 'DE',
    standard: 'eu-2014-45',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'nl-apk',
    country: 'NL',
    standard: 'eu-2014-45',
    severityScale: 'eu',
    group: 'regulatory',
    sections: EU_SECTIONS,
  },
  {
    id: 'standard-multipoint',
    country: null,
    standard: 'custom',
    severityScale: 'basic',
    group: 'workshop',
    sections: STANDARD_MULTIPOINT,
  },
  {
    id: 'pre-purchase',
    country: null,
    standard: 'custom',
    severityScale: 'basic',
    group: 'workshop',
    sections: PRE_PURCHASE,
  },
  {
    id: 'ev-hybrid',
    country: null,
    standard: 'custom',
    severityScale: 'eu',
    group: 'specialist',
    sections: EV_HYBRID,
  },
  {
    id: 'marine',
    country: null,
    standard: 'custom',
    severityScale: 'basic',
    group: 'specialist',
    sections: MARINE,
  },
  {
    id: 'blank',
    country: null,
    standard: 'custom',
    severityScale: 'basic',
    group: 'workshop',
    sections: [{ key: 'newSection', items: [{ key: 'newCheck' }] }],
  },
]

/** Gallery order; labels live in `inspections.presets.group`. */
export const PRESET_GROUPS: TemplatePreset['group'][] = ['regulatory', 'workshop', 'specialist']

export function getPreset(id: string): TemplatePreset | undefined {
  return TEMPLATE_PRESETS.find((p) => p.id === id)
}

/** Puts a preset's text into one language; English fills any gap. */
export function resolvePreset(
  preset: TemplatePreset,
  lib: InspectionLibrary = EN_LIBRARY
): ResolvedPreset {
  type PresetText = { name: string; description: string; standardLabel: string }
  const presetText =
    (lib.presets as Record<string, PresetText | undefined>)[preset.id] ??
    (EN_LIBRARY.presets as Record<string, PresetText | undefined>)[preset.id]
  return {
    ...preset,
    name: presetText?.name ?? preset.id,
    description: presetText?.description ?? '',
    standardLabel: presetText?.standardLabel ?? preset.standard,
    sections: preset.sections.map(({ descriptionKey, items, ...section }) => ({
      ...section,
      name: libraryText(lib, 'sections', section.key),
      description: descriptionKey ? libraryText(lib, 'descriptions', descriptionKey) : undefined,
      items: items.map(({ descriptionKey: itemDescriptionKey, ...item }) => ({
        ...item,
        name: libraryText(lib, 'checks', item.key),
        description: itemDescriptionKey
          ? libraryText(lib, 'descriptions', itemDescriptionKey)
          : undefined,
        choices: item.choices?.map((choice) => libraryText(lib, 'choices', choice)),
      })),
    })),
  }
}

/**
 * The namespaced, stable identity a preset carries once installed.
 *
 * Recorded on the template so the library recognises its own checklists after a
 * workshop renames them, and so an update can be told from a duplicate.
 */
export const PRESET_NAMESPACE = 'torqvoice'

export function presetPackageId(preset: TemplatePreset | string): string {
  return `${PRESET_NAMESPACE}/${typeof preset === 'string' ? preset : preset.id}`
}

/** Bumped when a preset's contents change enough to offer as an update. */
export const PRESET_VERSION = '1.0.0'

/**
 * Turns a preset into the nested Prisma create for an InspectionTemplate.
 * Shared by the template library sync and the onboarding installer so both
 * record the same provenance (packageId/version/source) and the library can
 * recognise an onboarding-installed template as its own. The text is written
 * in the language of `lib`, normally the workshop's.
 */
export function presetToTemplateCreate(
  source: TemplatePreset,
  organizationId: string,
  isDefault: boolean,
  lib: InspectionLibrary = EN_LIBRARY
) {
  const preset = resolvePreset(source, lib)
  return {
    name: preset.name,
    description: preset.description,
    isDefault,
    country: preset.country,
    standard: preset.standard,
    severityScale: preset.severityScale,
    packageId: presetPackageId(preset),
    packageVersion: PRESET_VERSION,
    packageSource: 'builtin',
    organizationId,
    sections: {
      create: preset.sections.map((section, sIdx) => ({
        name: section.name,
        description: section.description || null,
        code: section.code || null,
        sortOrder: sIdx,
        items: {
          create: section.items.map((item, iIdx) => ({
            name: item.name,
            description: item.description || null,
            code: item.code || null,
            sortOrder: iIdx,
            inputType: item.inputType ?? 'condition',
            unit: item.unit || null,
            minValue: item.minValue ?? null,
            maxValue: item.maxValue ?? null,
            choices: item.choices ?? [],
            required: item.required ?? false,
            photoRequired: item.photoRequired ?? false,
            allowNotApplicable: item.allowNotApplicable ?? true,
            defaultSeverity: item.defaultSeverity ?? null,
            defectSuggestions: [],
          })),
        },
      })),
    },
  }
}

export function countPresetItems(preset: Pick<TemplatePreset, 'sections'>): number {
  return preset.sections.reduce((sum, s) => sum + s.items.length, 0)
}

/**
 * The countries offered in the template settings. `null` covers a checklist
 * that is not tied to one country; the list is not exhaustive and the field
 * accepts anything, so a workshop outside it is not blocked.
 */
export const TEMPLATE_COUNTRY_CODES: string[] = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IE',
  'IT',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'CH',
  'GB',
]

/** The template countries named in one language and sorted for a dropdown. */
export function templateCountries(locale: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    names = null
  }
  return TEMPLATE_COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort(
    (a, b) => a.name.localeCompare(b.name, locale)
  )
}
