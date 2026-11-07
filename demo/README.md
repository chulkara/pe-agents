# Kalling — GitHub Pages demo

A static, public demonstration of Kalling's acquisition workspace. The private full app is separate and unchanged.

## Explore
1. Configure the example firm and buy box.
2. Add a company or import an NJ/NY target list from CSV.
3. Record source evidence, prepare a call brief, and log an owner conversation.
4. Set follow-ups, draft an introduction, and approve it without sending.
5. Read a text-based PDF or other supported document, inspect financial observations, and create an initial screening brief.
6. Review the evidence and promote the company into the separate opportunity pipeline.

Six fictional companies are labeled as samples. This public build starts from those samples, not records from the private app.

## Data behavior
All edits and extracted document text stay in this browser's local storage. There is no sign-in, shared database, server-side document storage, or background activity. Clearing this site's browser storage resets the workspace. Workspace exports are available in Activity log. Original uploaded files are not retained by a server.

Google Maps and company websites open externally. Record website observations manually. Automated website research, Maps data import, model-generated analysis, and email sending are not connected. Financial screening uses labeled figures and explicit rules; check source excerpts before drawing conclusions. PDF OCR and earnings normalization are not implemented.

## GitHub Pages deployment
The included `.github/workflows/pages.yml` runs tests, builds the static files, and publishes them using GitHub Pages.

1. Create a GitHub repository, `chulkara/pe-agents`.
2. Add this project under `demo/` and the workflow under the repository root `.github/workflows/` on `main`.
3. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
4. Run the workflow if it did not start automatically, and use the Pages URL returned by the deployment.

The build uses relative asset paths, including the PDF worker and fonts, so the repository path `/pe-agents/` works without changing the source. The GitHub Pages URL is intentionally not hardcoded before the account/repository is known.

## Local development
Requires Node 22.13 or newer.

```sh
npm ci
npm test
npm run dev
```

```sh
npm run build
npm run preview
```

`dist/` is the deployable static site. No API keys or secrets are required. This project is a prototype demonstration, not a production multi-user service.

## Editorial workspace redesign

Oliva (#C8C040), cotton blue (#B5D0D7), and vanilla (#FEE6A0) with warm light surfaces and dark navigation. The overview opens directly into the working desk, with an optional four-step tour. Company research, a structured owner call brief, editable outreach drafts, contact context, and the next action share a company workspace. Editing an approved draft returns it to review. Cmd/Ctrl+K searches companies. Mobile navigation opens from the menu button.

The prototype remains browser-local. Live Maps discovery, email sending, and model-powered analysis are not connected.
