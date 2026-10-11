import { describe, expect, test } from 'vitest';

import moduleJSON from '../../../module.json' with { type: 'json' };
import { MODULE_ID } from '@module/lib/constants';

describe('MODULE_ID', () => {
  test('matches the id declared in module.json', () => {
    expect(MODULE_ID).toBe(moduleJSON.id);
  });
});
