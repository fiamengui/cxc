import { issueLicense } from "./license-core.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) => {
  if (value.startsWith("--")) items.push([value.slice(2), all[index + 1]]);
  return items;
}, []));

const result = issueLicense({
  keyPath: args.key || process.env.BRATEC_LICENSE_PRIVATE_KEY,
  registryPath: args.registry || process.env.BRATEC_LICENSE_REGISTRY,
  outputDirectory: args.output || process.env.BRATEC_LICENSE_OUTPUT,
  customerName: args.customer,
  customerDocumentOptional: args.document,
  customerEmailOptional: args.email,
  installationId: args.installation,
  edition: args.edition,
  authorizedMajorVersion: args.major,
  notes: args.notes,
  reissueOf: args.reissue,
});
process.stdout.write(`${result.licenseId}\n${result.outputPath}\nSHA-256 ${result.fileHashSha256}\n`);
