import type { Condition, SeverityScale } from './conditions'
import { EN_LIBRARY, type InspectionLibrary, libraryText } from './inspectionLibrary'
import { NO_DEFECTS_BY_CODE, NO_STANDARD } from './norwayControlPoints'

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

/** The phrase is a key into the library's `defects` table, in the technician's language. */
type CatalogueEntry = [key: string, severity: DefectSeverity]

const entries = (
  source: DefectSuggestion['source'],
  list: CatalogueEntry[],
  lib: InspectionLibrary
): DefectSuggestion[] =>
  list.map(([key, severity]) => ({ text: libraryText(lib, 'defects', key), severity, source }))

/* -------------------------------------------------------------------------- */
/* Annex I reasons for failure, by check code                                 */
/* -------------------------------------------------------------------------- */

const BY_CODE: Record<string, CatalogueEntry[]> = {
  // 0. Identification
  '0.1': [
    ['registrationPlateMissing', 'fail'],
    ['registrationPlateInsecureLikelyFallOff', 'fail'],
    ['inscriptionMissingIllegibleDoesNotMatch', 'fail'],
  ],
  '0.2': [
    ['vinMissingNotFound', 'fail'],
    ['vinIncompleteIllegibleObviouslyFalsifiedDoes', 'fail'],
    ['vehicleDocumentsIllegibleContainFactualInaccuracy', 'attention'],
  ],

  // 1. Braking equipment
  '1.1.2': [
    ['excessiveTravelInsufficientReserveTravelBrake', 'fail'],
    ['brakeControlNotReleasingCorrectly', 'attention'],
    ['antiSlipProvisionBrakePedalMissing', 'fail'],
  ],
  '1.1.3': [
    ['pressureBuildUpTimeInsufficientEffective', 'fail'],
    ['insufficientPressureAssistBrakingLeastTwice', 'dangerous'],
    ['airAntifreezeLeak', 'fail'],
    ['externalDamageLikelyAffectFunctionBraking', 'dangerous'],
  ],
  '1.1.4': [
    ['gaugeIndicatorMalfunctioningDefective', 'attention'],
    ['lowPressureNotIdentifiable', 'fail'],
  ],
  '1.1.6': [
    ['parkingBrakeControlNotHoldingRatchet', 'fail'],
    ['excessiveWearControlPivotRatchetMechanism', 'attention'],
    ['excessiveMovementControlIndicatingIncorrectAdjustment', 'attention'],
    ['actuatorMissingDamagedInoperative', 'fail'],
  ],
  '1.1.10': [
    ['servoUnitDefectiveIneffective', 'fail'],
    ['servoUnitInoperative', 'dangerous'],
    ['masterCylinderDefectiveButBrakeStill', 'fail'],
    ['masterCylinderLeaking', 'fail'],
    ['brakeFluidReservoirLevelBelowMinimum', 'attention'],
    ['brakeFluidReservoirCapMissing', 'attention'],
  ],
  '1.1.11': [
    ['imminentRiskFailureFractureRigidPipe', 'dangerous'],
    ['pipesJointsLeaking', 'dangerous'],
    ['pipesDamagedExcessivelyCorroded', 'fail'],
    ['pipeMisplacedRiskDamage', 'fail'],
  ],
  '1.1.12': [
    ['imminentRiskFailureFractureFlexibleHose', 'dangerous'],
    ['hosesDamagedChafingTwistedTooShort', 'attention'],
    ['hosesCouplingsLeaking', 'dangerous'],
    ['hosesBulgingUnderPressure', 'fail'],
    ['hosesPorousCordDamaged', 'dangerous'],
  ],
  '1.1.13': [
    ['liningsPadsWornDownWearIndicator', 'fail'],
    ['liningsPadsWornBeyondWearIndicator', 'dangerous'],
    ['liningsPadsContaminatedOilGreaseOther', 'fail'],
    ['liningsPadsContaminatedBrakingEffectSeriously', 'dangerous'],
    ['liningPadMissingIncorrectlyMounted', 'dangerous'],
  ],
  '1.1.14': [
    ['drumDiscExcessivelyWornScoredCracked', 'dangerous'],
    ['drumDiscContaminatedOilGreaseOther', 'fail'],
    ['drumDiscContaminatedBrakingEffectSeriously', 'dangerous'],
    ['drumDiscMissing', 'dangerous'],
    ['backPlateInsecure', 'fail'],
  ],
  '1.1.15': [
    ['cableDamagedKnotted', 'fail'],
    ['componentExcessivelyWornCorroded', 'fail'],
    ['cableRodJointInsecure', 'fail'],
    ['cableGuideDefective', 'fail'],
    ['restrictionFreeMovementBrakingSystem', 'fail'],
  ],
  '1.1.16': [
    ['actuatorCrackedDamaged', 'fail'],
    ['actuatorLeaking', 'fail'],
    ['actuatorInsecureInadequatelyMounted', 'fail'],
    ['actuatorSeverelyCorroded', 'fail'],
  ],
  '1.1.17': [
    ['linkageDefective', 'fail'],
    ['linkageIncorrectlyAdjusted', 'fail'],
    ['valveSeizedInoperative', 'fail'],
    ['valveMissingWhereRequired', 'dangerous'],
  ],
  '1.1.21': [
    ['otherSystemDeviceDamagedBrakingSystem', 'fail'],
    ['airLeakageCausingNoticeableDropPressure', 'fail'],
    ['anyComponentInsecureInadequatelyMounted', 'fail'],
    ['unsafeModificationComponent', 'fail'],
  ],
  '1.2.1': [
    ['inadequateBrakingForceOneMoreWheels', 'fail'],
    ['noBrakingForceOneMoreWheels', 'dangerous'],
    ['brakingForceAnyWheelLessThan', 'fail'],
    ['excessiveFluctuationBrakingForceThroughAny', 'fail'],
    ['abnormallyLongDelayOperationBrakesAny', 'fail'],
  ],
  '1.2.2': [
    ['brakingRateBelowMinimumRequired', 'fail'],
    ['brakingRateLessThan50Required', 'dangerous'],
  ],
  '1.4.2': [
    ['parkingBrakeRateBelowMinimumRequired', 'fail'],
    ['parkingBrakeRateLessThan50', 'dangerous'],
    ['parkingBrakeDoesNotHoldVehicle', 'fail'],
  ],
  '1.6': [
    ['absWarningDeviceIndicatesMalfunction', 'fail'],
    ['absWarningDeviceInoperative', 'fail'],
    ['absWheelSpeedSensorMissingDamaged', 'fail'],
    ['absWiringDamaged', 'fail'],
    ['absSystemInoperative', 'fail'],
  ],
  '1.7': [
    ['ebsWarningDeviceIndicatesMalfunction', 'fail'],
    ['ebsWarningDeviceInoperative', 'fail'],
  ],
  '1.8': [
    ['brakeFluidContaminated', 'fail'],
    ['brakeFluidBoilingPointTooLow', 'fail'],
    ['brakeFluidBelowMinimumLevel', 'attention'],
  ],

  // 2. Steering
  '2.1': [
    ['steeringBoxShaftTurningStiffly', 'fail'],
    ['steeringBoxShaftExcessivelyWorn', 'fail'],
    ['excessiveMovementSteeringBox', 'fail'],
    ['steeringBoxLeaking', 'attention'],
    ['steeringBoxDrippingOil', 'fail'],
    ['steeringComponentInsecureCrackedExcessivelyWorn', 'fail'],
    ['steeringComponentInsecurePointAffectingSafety', 'dangerous'],
  ],
  '2.2': [
    ['relativeMovementBetweenSteeringWheelColumn', 'fail'],
    ['steeringWheelRetainingDeviceMissing', 'dangerous'],
    ['columnBearingsCouplingsExcessivelyWorn', 'fail'],
    ['excessiveVerticalRadialMovementSteeringWheel', 'fail'],
    ['handlebarsCrackedInsecureForkStem', 'dangerous'],
  ],
  '2.3': [
    ['excessiveFreePlaySteeringWheelHandlebars', 'fail'],
    ['freePlaySoExcessiveThatSafe', 'dangerous'],
  ],
  '2.4': [
    ['wheelAlignmentOutsideManufacturerSpecification', 'attention'],
    ['alignmentCausingAbnormalUnevenTyreWear', 'fail'],
  ],
  '2.6': [
    ['powerSteeringSystemLeaking', 'attention'],
    ['insufficientPowerSteeringFluidBelowMinimum', 'attention'],
    ['powerSteeringMechanismNotFunctioning', 'fail'],
    ['powerSteeringMechanismCrackedInsecure', 'fail'],
    ['steeringWheelHandlebarsMisalignedIncompatibleRoad', 'fail'],
  ],

  // 3. Visibility
  '3.1': [
    ['obstructionWithinDriverFieldVisionThat', 'fail'],
    ['obstructionThatSeriouslyAffectsViewThrough', 'dangerous'],
  ],
  '3.2': [
    ['glassCrackedDiscoloured', 'attention'],
    ['crackedDiscolouredGlassWithinSweptArea', 'fail'],
    ['glassNotConformingApplicableRequirements', 'fail'],
    ['conditionGlassSeriouslyImpairingVisibility', 'dangerous'],
    ['chipWithinDriverCriticalVisionArea', 'fail'],
  ],
  '3.3': [
    ['mirrorDeviceMissingNotFittedAs', 'fail'],
    ['mirrorDeviceDefectiveLooseInsecure', 'attention'],
    ['mirrorDeviceInsufficientFieldVision', 'fail'],
  ],
  '3.4': [
    ['wipersNotOperatingMissing', 'fail'],
    ['wiperBladeDefective', 'attention'],
    ['wiperBladeMissingObviouslyIneffective', 'fail'],
    ['wiperSmearingJudderingAcrossSweptArea', 'attention'],
  ],
  '3.5': [
    ['washersNotOperatingAdequately', 'attention'],
    ['washersNotOperatingAll', 'fail'],
    ['washerFluidReservoirEmpty', 'attention'],
  ],
  '3.6': [['demistingDefrostingSystemInoperativeClearlyNot', 'attention']],

  // 4. Lamps, reflectors and electrical equipment
  '4.1.1': [
    ['lightSourceLampDefectiveMissing', 'attention'],
    ['twoLightSourcesLampsDefectiveMissing', 'fail'],
    ['projectionSystemSlightlyDefective', 'attention'],
    ['projectionSystemSeverelyDefectiveMissing', 'fail'],
    ['lampInsecurelyAttached', 'attention'],
    ['lensHeavilyCloudedReducingLightOutput', 'attention'],
    ['colourEmittedLightNotCompliant', 'fail'],
  ],
  '4.1.2': [['headlampAimOutsideRequiredLimits', 'attention']],
  '4.2': [
    ['lightSourceLampDefective', 'attention'],
    ['lensDefective', 'attention'],
    ['lampInsecurelyAttachedSeriousRiskFalling', 'fail'],
    ['colourEmittedLightNotCompliant', 'fail'],
  ],
  '4.3': [
    ['stopLampNotOperating', 'fail'],
    ['oneStopLampPairNotOperating', 'attention'],
    ['noStopLampOperatingAll', 'dangerous'],
    ['stopLampOperatingPermanently', 'fail'],
  ],
  '4.4': [
    ['indicatorHazardLampNotOperating', 'fail'],
    ['flashingRateOutsideRequiredRange', 'attention'],
    ['colourEmittedLightNotCompliant', 'fail'],
    ['indicatorTellTaleInoperative', 'attention'],
  ],
  '4.5': [
    ['fogLampNotOperating', 'attention'],
    ['fogLampIncorrectlyAimed', 'attention'],
    ['rearFogLampOperatingPermanently', 'attention'],
  ],
  '4.6': [
    ['reversingLampNotOperating', 'attention'],
    ['reversingLampOperatingPermanentlyShowingRear', 'fail'],
  ],
  '4.7': [['registrationPlateLampNotOperatingMissing', 'attention']],
  '4.8': [
    ['reflectorDefectiveDamagedMissing', 'attention'],
    ['conspicuityMarkingDamagedDirtyPartlyMissing', 'attention'],
    ['reflectorColourNotCompliant', 'fail'],
  ],
  '4.9': [
    ['tellTaleNotOperating', 'attention'],
    ['tellTaleIndicatingMalfunctionSafetyRelated', 'fail'],
  ],
  '4.10': [
    ['fixedComponentsInsecureDamaged', 'attention'],
    ['insulationDamagedDeteriorated', 'attention'],
    ['trailerElectricalConnectionNotFunctioning', 'fail'],
  ],
  '4.11': [
    ['wiringInsecureInadequatelySecured', 'attention'],
    ['wiringInsulationDamagedDeteriorated', 'fail'],
    ['wiringDamagedRiskFireSparking', 'dangerous'],
    ['excessivelyDeterioratedWiringEngineBayNear', 'fail'],
  ],
  '4.13': [
    ['batteryInsecure', 'attention'],
    ['batteryLeaking', 'fail'],
    ['batteryLeakingCorrosiveElectrolyte', 'dangerous'],
    ['batterySwitchDefective', 'fail'],
    ['batteryTerminalsCorrodedLoose', 'attention'],
    ['batteryStateChargeBelowServiceableThreshold', 'attention'],
  ],

  // 5. Axles, wheels, tyres and suspension
  '5.1.1': [
    ['axleCrackedDeformed', 'dangerous'],
    ['axleInsecurelyAttachedVehicle', 'fail'],
    ['unsafeModificationAxle', 'dangerous'],
  ],
  '5.1.3': [
    ['wheelBearingExcessivePlay', 'fail'],
    ['wheelBearingTooTightSeizing', 'dangerous'],
    ['wheelBearingNoisyUnderLoad', 'fail'],
  ],
  '5.2.1': [
    ['wheelFractureDefectiveWelding', 'dangerous'],
    ['wheelRetainingRingsNotCorrectlyFitted', 'dangerous'],
    ['wheelBadlyDistortedWorn', 'fail'],
    ['wheelNutsStudsMissingLoose', 'dangerous'],
    ['wheelSizeTypeNotCompatibleAffecting', 'fail'],
  ],
  '5.2.3': [
    ['treadDepthBelowLegalMinimum', 'fail'],
    ['treadWearIndicatorVisible', 'fail'],
    ['tyreSeverelyDamagedCut', 'fail'],
    ['tyreCordsVisibleDamaged', 'dangerous'],
    ['tyresDifferentSizeConstructionSameAxle', 'fail'],
    ['tyreLoadIndexSpeedRatingNot', 'fail'],
    ['tyreRubbingAgainstAnotherComponent', 'attention'],
    ['tyreSeriouslyRubbingAgainstAnotherComponent', 'fail'],
    ['unevenWearAcrossTreadIndicatingAlignment', 'attention'],
    ['tyrePressureOutsideManufacturerSpecification', 'attention'],
    ['tyrePerishedShowingSidewallCrackingAge', 'attention'],
  ],
  '5.3.1': [
    ['springsInsecurelyAttachedChassisAxle', 'fail'],
    ['springComponentDamagedCracked', 'fail'],
    ['springMissingBroken', 'dangerous'],
    ['stabiliserBarLinkWornInsecure', 'fail'],
  ],
  '5.3.2': [
    ['shockAbsorbersInsecure', 'attention'],
    ['shockAbsorbersInsecureRiskDetachment', 'fail'],
    ['shockAbsorberDamagedShowingSignsSevere', 'fail'],
    ['shockAbsorberMissing', 'fail'],
  ],
  '5.3.4': [
    ['suspensionArmRodJointExcessivelyWorn', 'fail'],
    ['jointExcessivePlaySeriouslyAffectingStability', 'dangerous'],
    ['rubberBushPerishedSplitMissing', 'fail'],
    ['dustCoverSplitMissing', 'attention'],
    ['componentInsecureBadlyCorroded', 'fail'],
  ],

  // 6. Chassis and chassis attachments
  '6.1.1': [
    ['slightDamageMemberCrossmember', 'attention'],
    ['seriousDamageMemberCrossmember', 'fail'],
    ['insecurityMemberCrossmember', 'fail'],
    ['excessiveCorrosionAffectingRigidityAssembly', 'fail'],
    ['corrosionPerforatingStructuralLoadBearingMember', 'dangerous'],
    ['unsafeRepairModificationStructure', 'dangerous'],
  ],
  '6.1.2': [
    ['exhaustSystemInsecureLeaking', 'fail'],
    ['fumesEnteringCabPassengerCompartment', 'fail'],
    ['fumesEnteringCabQuantityDangerousHealth', 'dangerous'],
    ['exhaustSilencerDefectiveMissingBypassed', 'fail'],
  ],
  '6.1.3': [
    ['fuelTankPipesInsecure', 'fail'],
    ['fuelLeakingFillerCapMissingIneffective', 'fail'],
    ['fuelLeakingRiskFire', 'dangerous'],
    ['fuelPipesChafingDamaged', 'fail'],
    ['heatShieldMissingIneffective', 'fail'],
  ],
  '6.1.6': [['spareWheelCarrierInsecureUnsatisfactoryCondition', 'attention']],
  '6.1.7': [
    ['couplingDeviceDamagedDefectiveCracked', 'fail'],
    ['couplingDeviceExcessivelyWorn', 'fail'],
    ['couplingDeviceDefectivePointRiskingDetachment', 'dangerous'],
    ['safetyDeviceMissingDamagedNotFunctioning', 'fail'],
  ],
  '6.2.1': [
    ['panelComponentLooseDamagedLikelyCause', 'fail'],
    ['bodyPillarInsecure', 'fail'],
    ['ingressEngineExhaustFumes', 'dangerous'],
    ['corrosionAreaThatCouldInjureOccupant', 'fail'],
    ['sharpEdgeProtrusionLikelyCauseInjury', 'fail'],
  ],
  '6.2.3': [
    ['doorHatchDoesNotOpenClose', 'fail'],
    ['doorHatchLiableOpenUnintentionallyFails', 'dangerous'],
    ['doorHingeCatchPillarDeteriorated', 'attention'],
  ],
  '6.2.4': [
    ['floorInsecureBadlyDeteriorated', 'fail'],
    ['floorInsufficientlySecureSafeStand', 'dangerous'],
  ],
  '6.2.5': [
    ['seatDefectiveStructure', 'fail'],
    ['seatInsecurelyMounted', 'dangerous'],
    ['seatAdjustmentMechanismNotFunctioningCorrectly', 'fail'],
  ],
  '6.2.7': [
    ['stepFootRestInsecure', 'attention'],
    ['stepInsecurePointRiskingInjury', 'fail'],
  ],
  '6.2.11': [
    ['mudguardMissingLooseBadlyCorroded', 'attention'],
    ['insufficientClearanceWheelSpraySuppressionIneffective', 'attention'],
  ],

  // 7. Other equipment
  '7.1': [
    ['beltAnchorageBadlyDeteriorated', 'fail'],
    ['anchorageDeterioratedPointAffectingStability', 'dangerous'],
    ['beltDamagedCutSignOverstretching', 'fail'],
    ['beltFrayedDirtyButServiceable', 'attention'],
    ['beltRetractorBuckleNotOperatingCorrectly', 'fail'],
    ['beltMissingWhereOneRequired', 'fail'],
    ['airbagSrsWarningLampIndicatesSystem', 'fail'],
  ],
  '7.2': [
    ['fireExtinguisherMissingWhereRequired', 'attention'],
    ['fireExtinguisherOutServiceDateDischarged', 'attention'],
    ['fireExtinguisherNotSecurelyMounted', 'attention'],
  ],
  '7.3': [
    ['deviceNotFunctioningPreventVehicleBeing', 'attention'],
    ['deviceDefectiveLockingUnintentionally', 'fail'],
  ],
  '7.4': [['warningTriangleMissingIncomplete', 'attention']],
  '7.5': [['firstAidKitMissingIncompleteOut', 'attention']],
  '7.7': [
    ['audibleWarningDeviceNotWorkingAll', 'fail'],
    ['controlInsecureDeviceSoundingIntermittently', 'attention'],
    ['toneNotCompliantClearlyInadequate', 'attention'],
  ],
  '7.8': [
    ['speedometerNotFittedWhereRequired', 'fail'],
    ['speedometerNotFunctioning', 'attention'],
    ['speedometerNotIlluminated', 'attention'],
  ],
  '7.9': [
    ['tachographMissingWhereRequired', 'fail'],
    ['tachographNotFunctioningSealsBroken', 'fail'],
    ['tachographCalibrationPlateMissingIllegibleOut', 'fail'],
    ['obviousEvidenceTamperingManipulation', 'fail'],
  ],
  '7.10': [
    ['speedLimitationDeviceMissingWhereRequired', 'fail'],
    ['speedLimitationDeviceEvidentlyNotFunctioning', 'fail'],
    ['speedLimitationDeviceSetWrongSpeed', 'fail'],
  ],
  '7.11': [
    ['odometerObviouslyManipulatedMisrepresentMileage', 'fail'],
    ['odometerObviouslyNotFunctioning', 'attention'],
  ],
  '7.12': [
    ['escWheelSpeedSensorMissingDamaged', 'fail'],
    ['escWiringDamaged', 'fail'],
    ['escWarningDeviceIndicatesMalfunction', 'fail'],
    ['escSystemInoperative', 'fail'],
  ],

  // 8. Nuisance
  '8.1': [
    ['noiseLevelExceedingPermittedLevel', 'fail'],
    ['partNoiseSuppressionSystemLooseDamaged', 'fail'],
    ['partNoiseSuppressionSystemLikelyIncrease', 'dangerous'],
  ],
  '8.2.1.2': [
    ['coContentExceedingPermittedLevel', 'fail'],
    ['lambdaOutsideRange1003', 'fail'],
    ['emissionControlEquipmentMissingModifiedObviously', 'fail'],
    ['engineManagementIndicatingSeriousMalfunction', 'fail'],
  ],
  '8.2.2.1': [
    ['emissionControlEquipmentMissingObviouslyDefective', 'fail'],
    ['dieselParticulateFilterObviouslyModifiedRemoved', 'fail'],
    ['egrScrSystemObviouslyDefectiveBypassed', 'fail'],
  ],
  '8.2.2.2': [
    ['smokeOpacityExceedingLevelRecordedManufacturer', 'fail'],
    ['excessiveSmokeObscuringViewOtherRoad', 'dangerous'],
    ['smokeOpacityExceedingApplicableLimit', 'fail'],
  ],
  '8.5': [
    ['excessiveFluidLeakLikelyHarmEnvironment', 'fail'],
    ['constantFormationDropsPresentingVerySerious', 'dangerous'],
    ['seepageWeepingWithoutDripping', 'attention'],
  ],
}

/* -------------------------------------------------------------------------- */
/* Section-level fallbacks, for codes without an entry of their own           */
/* -------------------------------------------------------------------------- */

const BY_SECTION: Record<string, CatalogueEntry[]> = {
  '1': [
    ['componentExcessivelyWorn', 'fail'],
    ['componentInsecureInadequatelyMounted', 'fail'],
    ['leakFromBrakingSystem', 'fail'],
    ['brakingPerformanceReduced', 'fail'],
  ],
  '2': [
    ['excessivePlaySteering', 'fail'],
    ['componentWornInsecureDamaged', 'fail'],
    ['leakFromSteeringSystem', 'attention'],
  ],
  '3': [
    ['visibilityImpaired', 'fail'],
    ['componentDefectiveMissingIneffective', 'attention'],
  ],
  '4': [
    ['lampNotOperating', 'fail'],
    ['lampDefectiveDamagedInsecure', 'attention'],
    ['colourEmittedLightNotCompliant', 'fail'],
  ],
  '5': [
    ['componentExcessivelyWorn', 'fail'],
    ['componentInsecureDamaged', 'fail'],
    ['excessivePlay', 'fail'],
  ],
  '6': [
    ['corrosionAffectingStructure', 'fail'],
    ['componentInsecureLooseDamaged', 'fail'],
    ['leakFromSystem', 'fail'],
  ],
  '7': [
    ['equipmentMissingWhereRequired', 'fail'],
    ['equipmentDefectiveNotFunctioning', 'fail'],
    ['equipmentOutServiceDate', 'attention'],
  ],
  '8': [
    ['emissionNoiseLevelExceedingPermittedLimit', 'fail'],
    ['controlEquipmentMissingModifiedDefective', 'fail'],
    ['fluidLeak', 'attention'],
  ],
}

/* -------------------------------------------------------------------------- */
/* Keyword fallbacks, for checklists that carry no regulation codes           */
/* -------------------------------------------------------------------------- */

/**
 * `match` covers English names; `group` names the library's `defectKeywords`
 * entry, a comma-separated list of word stems for checks named in the
 * workshop's own language.
 */
const BY_KEYWORD: {
  group: keyof InspectionLibrary['defectKeywords']
  match: RegExp
  suggestions: CatalogueEntry[]
}[] = [
  {
    group: 'brakes',
    match: /\b(pad|disc|drum|brake|caliper)\b/i,
    suggestions: [
      ['wornCloseMinimumThicknessReplacementDue', 'attention'],
      ['wornBelowMinimumThickness', 'fail'],
      ['scoredCrackedCorroded', 'fail'],
      ['contaminatedOilGrease', 'fail'],
      ['seizedBinding', 'fail'],
    ],
  },
  {
    group: 'tyres',
    match: /\b(tyre|tire|tread|wheel)\b/i,
    suggestions: [
      ['treadApproachingLegalMinimum', 'attention'],
      ['treadBelowLegalMinimum', 'fail'],
      ['unevenEdgeWear', 'attention'],
      ['sidewallDamageBulgeCut', 'dangerous'],
      ['perishedAgeCracking', 'attention'],
      ['pressureIncorrect', 'attention'],
    ],
  },
  {
    group: 'fluids',
    match: /\b(oil|coolant|fluid|leak|grease)\b/i,
    suggestions: [
      ['levelLowToppedUp', 'attention'],
      ['seepageNoDripping', 'attention'],
      ['activeLeakDripping', 'fail'],
      ['fluidContaminatedOverdueReplacement', 'attention'],
    ],
  },
  {
    group: 'lights',
    match: /\b(lamp|light|bulb|headlamp|indicator|beam)\b/i,
    suggestions: [
      ['bulbBlown', 'fail'],
      ['lensCrackedCloudedDiscoloured', 'attention'],
      ['aimIncorrect', 'attention'],
      ['insecureWaterIngress', 'attention'],
    ],
  },
  {
    group: 'beltsHoses',
    match: /\b(belt|hose|pipe)\b/i,
    suggestions: [
      ['perishedCrackedGlazed', 'attention'],
      ['chafingAgainstAdjacentComponent', 'fail'],
      ['splitLeaking', 'fail'],
      ['tensionIncorrect', 'attention'],
    ],
  },
  {
    group: 'battery',
    match: /\b(battery|charge|voltage|alternator)\b/i,
    suggestions: [
      ['stateChargeLow', 'attention'],
      ['terminalsCorrodedLoose', 'attention'],
      ['failsLoadTestReplacementDue', 'fail'],
      ['casingDamagedLeaking', 'fail'],
    ],
  },
  {
    group: 'suspension',
    match: /\b(suspension|shock|damper|spring|bush|joint|bearing)\b/i,
    suggestions: [
      ['excessivePlay', 'fail'],
      ['bushPerishedSplit', 'fail'],
      ['leakingIneffective', 'fail'],
      ['corrodedInsecure', 'fail'],
      ['noisyUnderLoad', 'attention'],
    ],
  },
  {
    group: 'exhaust',
    match: /\b(exhaust|emission|smoke|silencer|dpf|catalyst)\b/i,
    suggestions: [
      ['blowingJoint', 'fail'],
      ['corrodedRepairDueSoon', 'attention'],
      ['mountingPerishedInsecure', 'attention'],
      ['emissionsAboveLimit', 'fail'],
    ],
  },
  {
    group: 'glass',
    match: /\b(wiper|washer|screen|windscreen|glass|mirror)\b/i,
    suggestions: [
      ['bladeSmearingJuddering', 'attention'],
      ['chipCrackOutsideSweptArea', 'attention'],
      ['chipCrackDriverVisionArea', 'fail'],
      ['washerJetBlockedMisaligned', 'attention'],
    ],
  },
  {
    group: 'filters',
    match: /\b(filter|air|cabin|pollen)\b/i,
    suggestions: [
      ['dirtyReplacementRecommended', 'attention'],
      ['heavilyContaminatedReplacementDue', 'fail'],
    ],
  },
]

/** Always offered, so there is a phrase to hand even for an unusual check. */
const GENERAL: CatalogueEntry[] = [
  ['wornWithinLimitsMonitorNextService', 'attention'],
  ['wornBeyondServiceableLimit', 'fail'],
  ['damaged', 'fail'],
  ['corroded', 'attention'],
  ['insecureLoose', 'fail'],
  ['leaking', 'fail'],
  ['missing', 'fail'],
  ['notWorking', 'fail'],
  ['excessivePlay', 'fail'],
  ['advisoryOnlyNoActionNeededYet', 'attention'],
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
  /** The template's regime. Norway's instruks has its own codes and wording. */
  standard?: string | null
}

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** Whether a check name contains one of a locale's comma-separated stems. */
function matchesStems(name: string, stems: string | undefined): boolean {
  if (!stems) return false
  const lower = name.toLocaleLowerCase()
  return stems
    .split(',')
    .map((stem) => stem.trim().toLocaleLowerCase())
    .some((stem) => stem.length > 0 && lower.includes(stem))
}

/** Catalogue entries for a check, most specific source first. */
function catalogueFor(check: SuggestionCheck, lib: InspectionLibrary): DefectSuggestion[] {
  const found: DefectSuggestion[] = []

  const code = check.code?.trim()
  // The Norwegian instruks numbers its points differently from the Directive,
  // so its codes are looked up in its own table and never in the Annex's.
  const norway = check.standard === NO_STANDARD
  const byCode = norway ? NO_DEFECTS_BY_CODE : BY_CODE
  if (code) {
    if (byCode[code]) found.push(...entries('regulation', byCode[code], lib))

    // "1.1.13" has no entry of its own → try "1.1", then "1". A template can
    // reference a check at whatever depth suits it and still get useful text.
    const parts = code.split('.')
    for (let i = parts.length - 1; i > 0 && found.length === 0; i--) {
      const parent = parts.slice(0, i).join('.')
      if (byCode[parent]) found.push(...entries('regulation', byCode[parent], lib))
    }
  }

  const section = (check.sectionCode ?? code ?? '').split('.')[0]
  if (!norway && BY_SECTION[section]) {
    found.push(...entries('regulation', BY_SECTION[section], lib))
  }

  for (const { group, match, suggestions } of BY_KEYWORD) {
    if (match.test(check.name) || matchesStems(check.name, lib.defectKeywords[group])) {
      found.push(...entries('general', suggestions, lib))
    }
  }

  found.push(...entries('general', GENERAL, lib))
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
    lib = EN_LIBRARY,
  }: {
    scale?: SeverityScale
    /** The catalogue's language, normally the technician's. */
    lib?: InspectionLibrary
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

  const all = [...workshop, ...past, ...catalogueFor(check, lib)]

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
