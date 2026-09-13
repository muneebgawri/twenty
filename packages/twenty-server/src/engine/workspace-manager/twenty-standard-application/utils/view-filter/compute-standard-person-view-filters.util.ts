import { ViewFilterOperand } from 'twenty-shared/types';

import { type FlatViewFilter } from 'src/engine/metadata-modules/flat-view-filter/types/flat-view-filter.type';
import {
  createStandardViewFilterFlatMetadata,
  type CreateStandardViewFilterArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-filter/create-standard-view-filter-flat-metadata.util';

export const computeStandardPersonViewFilters = (
  args: Omit<CreateStandardViewFilterArgs<'person'>, 'context'>,
): Record<string, FlatViewFilter> => ({
  personalLeadsCreatedByMe: createStandardViewFilterFlatMetadata({
    ...args,
    objectName: 'person',
    context: {
      viewName: 'personalLeads',
      viewFilterName: 'createdByMe',
      fieldName: 'createdBy',
      subFieldName: 'workspaceMemberId',
      operand: ViewFilterOperand.IS,
      value: JSON.stringify({
        isCurrentWorkspaceMemberSelected: true,
        selectedRecordIds: [],
      }),
    },
  }),
});
