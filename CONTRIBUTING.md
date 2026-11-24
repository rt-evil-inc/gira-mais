# Contributing to Gira+

First off, thank you for considering contributing to Gira+! It's people like you that make open source great.

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, they should reciprocate that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please make sure to include the following:
- Your device's operating system version.
- The version of the app you are using.
- Detailed steps to reproduce the bug.
- What you expected to happen and what happened instead.

### Suggesting Enhancements

If you have an idea for a new feature or an improvement to an existing one, we'd love to hear about it. Please open an issue and describe your suggestion in detail.

### Pull Requests

We welcome pull requests. If you're planning to implement a new feature, please open an issue first to discuss it with the maintainers.

- **Keep it lean.** Less is more. Simplicity is valued. Check that all of your changes are actually relevant.
- **Write tests that can fail.** A test must fail when the behaviour it names breaks. Skip tests for what can't break, such as types, constants or a mock returning what it was told to.
- **Comment rarely.** Write a comment only for a reason the code can't show. Don't restate the code or describe the change.
- **Say how you checked it.** Mention the device or emulator, and what you couldn't check. UI changes need before and after screenshots.
- **Using AI.** Coding agents are welcome and the same rules apply, so read the diff before you open the PR. End the description with the model and harness that did the work, for example `Model: Claude Opus 5.5 · Harness: Claude Code`. Agents read [`AGENTS.md`](AGENTS.md).

## Development Setup

The project is built with SvelteKit and Capacitor. To get started with development, please follow the instructions in the [`README.md`](README.md:1) file for your operating system (Android or iOS).

Here is a summary of the steps:

1.  Clone the repository:
    ```bash
    git clone https://github.com/rt-evil-inc/gira-mais.git
    cd gira-mais
    ```

2.  Install dependencies:
    ```bash
    bun install # or npm install
    ```

3.  Run the development server:
    ```bash
    bun run dev # or npm run dev
    ```

    To debug the app on an Android device, you can use:
    ```bash
    bun run build-app-dev # or npm run build-app-dev
    ```

    To debug on a browser, just open the dev server URL (http://localhost:5173) in any browser. In development, requests to the EMEL, VAIMOO and Gira+ APIs go through a local proxy on the Vite dev server (the `/__dev-proxy/*` routes in [`vite.config.ts`](vite.config.ts)), so there is no need to disable CORS in your browser. If the app needs to reach another backend that doesn't allow cross-origin requests, add a matching proxy entry there. To use a local [gira-web](https://github.com/rt-evil-inc/gira-mais-web) instead of the production Gira+ API, set `VITE_GIRA_MAIS_DEV_SERVER` to its URL (e.g. `VITE_GIRA_MAIS_DEV_SERVER=http://localhost:5299` in `.env.development.local`); the app then also shares arrival times in development, debug trips included.

## Code Style and Linting

To ensure code consistency, we use ESLint. Before submitting a pull request, please make sure your code is formatted correctly.

Running `npm run lint` on the entire project can be slow. For a better experience, we recommend one of the following approaches:

- **Using the ESLint VS Code extension:** The [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) will automatically highlight and help fix issues in your editor as you code.

- **Linting individual files:**
  ```bash
  bunx eslint path/to/your/file.svelte
  ```
  or
  ```bash
  npx eslint path/to/your/file.svelte
  ```

Please fix any issues before committing your changes.

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html), with an additional permission allowing the original contributors, Rodrigo and Tiago, to release the project under any additional license in the future without removing the GPL v3 license from the current version of the project. This additional permission is intended to allow the code to be used for purposes that are not compatible with open-source code, provided that it is done with explicit permission from the original contributors.

For the complete terms, please refer to the [LICENSE](LICENSE) file.

By contributing to Gira+, you agree that your contributions will be licensed under these terms.