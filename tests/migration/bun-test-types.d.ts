// Only the Bun runner surface used by the tests. Keep the library's standard
// DOM fetch contract separate from Bun's required fetch.preconnect extension.
export {
  after as afterAll,
  afterEach,
  before as beforeAll,
  beforeEach,
  describe,
  it,
  it as test,
} from "node:test";
