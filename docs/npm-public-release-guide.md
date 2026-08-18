# Public npm Release Guide

This guide explains how to publish this package as a public npm module.

## 1. Choose package name

1. Pick a package name.
2. Check availability:

```bash
npm view <package-name>
```

3. If scoped (for example @your-scope/layered-grid), make sure you own the scope.

## 2. Verify package metadata

In package.json, confirm these fields are set:

- name
- version
- description
- license
- repository
- homepage
- bugs
- keywords
- author
- private: false

If you use a scoped package and want public access, publish with --access public.

## 3. Verify build outputs and entry points

Make sure build output files exist and package.json points to them correctly:

- main
- module
- types
- exports

Make sure type declaration files are generated.

## 4. Limit published files

Use either:

- files field in package.json, or
- .npmignore

Recommended approach:

- Include dist/
- Include README.md
- Include LICENSE
- Exclude demo/, tests, local configs, and large artifacts you do not want to ship

## 5. Add publish safety checks

Add scripts to package.json:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsup",
    "prepublishOnly": "npm run typecheck && npm run build"
  }
}
```

This prevents publishing broken builds.

## 6. Test the package tarball locally

1. Create tarball:

```bash
npm pack
```

2. Inspect what will be published.
3. Install tarball in a temp project and verify imports and types.

## 7. Login and secure npm account

```bash
npm login
```

Then enable 2FA in npm account settings.

## 8. Publish

First release:

```bash
npm publish --access public
```

For unscoped packages, --access public is typically not required.

## 9. Verify installation

From a clean folder:

```bash
npm install <package-name>
```

Then confirm:

- runtime import works
- TypeScript types resolve
- README quick-start runs as expected

## 10. Ongoing releases

Use semantic versioning:

```bash
npm version patch
npm version minor
npm version major
```

Then publish:

```bash
npm publish
```

Tag releases in GitHub for better discoverability.

## Quick checklist

- package name available
- package.json metadata complete
- private is false
- build and typecheck pass
- prepublishOnly script configured
- npm pack inspected
- npm login complete
- 2FA enabled
- publish completed
- fresh install verified
