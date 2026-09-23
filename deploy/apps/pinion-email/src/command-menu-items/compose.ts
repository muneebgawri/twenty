import { COMPOSER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/front-components/composer';
import {
  defineCommandMenuItem,
  numberOfSelectedRecords,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

/**
 * Opened from a selected person, which is how an AM actually works -- find the
 * contact, then write to them -- and it gives the composer the address to
 * prefill.
 *
 * Not pinned. Twenty's own composer still exists and this one sits beside it;
 * until people have used it, the quieter of the two entry points is the honest
 * default (PRD §8).
 */
export default defineCommandMenuItem({
  universalIdentifier: '6a1f3c85-4e29-4b70-9d3a-71c40b2e8f63',
  frontComponentUniversalIdentifier:
    COMPOSER_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  label: 'Write email (Pinion)',
  isPinned: false,
  availabilityType: 'RECORD_SELECTION',
  availabilityObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  // An expression, not a string: the SDK compiles it into the stored rule.
  conditionalAvailabilityExpression: numberOfSelectedRecords >= 1,
});
