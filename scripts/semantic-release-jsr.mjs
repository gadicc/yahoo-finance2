// semantic-release v25 requires a default lifecycle export. The implementation
// routes JSR verification/versioning/publication to its isolated private stage.
export { default } from "./publisher/jsr-hooks.mjs";
