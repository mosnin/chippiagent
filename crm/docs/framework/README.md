# SaaS Framework Repository

This repository is a reusable framework pack for starting SaaS website and application projects with Claude.

## Purpose

This repo provides a two layer system:

1. Framework layer  
   Reusable operating system files for website structure, internal app structure, design systems, routing, build rules, and initialization prompts.

2. Project layer  
   Generated inside each actual app repository from the templates in this repo. The project layer contains app specific documents such as the app idea, feature spec, user flows, edge cases, tech stack, permissions matrix, and acceptance criteria.

## Recommended Usage

Inside a new project repository:

1. Clone this repository into `docs/framework`
2. Read all files in:
   - `docs/framework/website`
   - `docs/framework/internal`
   - `docs/framework/templates`
   - `docs/framework/prompts`
3. Generate `docs/project/*` from the template files based on the app idea
4. Treat:
   - `docs/framework/*` as reusable defaults
   - `docs/project/*` as app specific source of truth
5. Only then begin implementation

## Repository Structure

```text
docs/
  framework/
    website/
    internal/
    templates/
    prompts/
```

## Framework Philosophy

- Website docs govern the external acquisition layer
- Internal docs govern the product application layer
- Template docs define the shape of project specific documents
- Prompt docs define the initialization and execution sequence

## Notes

This repository should remain static and reusable. App specific filled out documents should be created in the target project repository, not committed here as live product docs.
