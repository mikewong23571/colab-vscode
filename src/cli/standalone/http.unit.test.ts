/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'chai';
import { stripXssiPrefix } from './http';

describe('standalone/http stripXssiPrefix', () => {
  it('strips the XSSI prefix with LF', () => {
    expect(stripXssiPrefix(")]}'\n{\"token\":\"abc\"}")).to.equal(
      '{"token":"abc"}',
    );
  });

  it('strips the XSSI prefix with CRLF', () => {
    expect(stripXssiPrefix(")]}'\r\n{\"token\":\"abc\"}")).to.equal(
      '{"token":"abc"}',
    );
  });

  it('strips the XSSI prefix without line ending', () => {
    expect(stripXssiPrefix(")]}'{\"token\":\"abc\"}")).to.equal(
      '{"token":"abc"}',
    );
  });

  it('leaves non-XSSI payloads unchanged', () => {
    expect(stripXssiPrefix('{"token":"abc"}')).to.equal('{"token":"abc"}');
  });
});
