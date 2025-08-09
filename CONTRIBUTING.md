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

    To debug on a browser, you need to disable CORS restrictions. On Chrome, you can do this by running:
    ```bash
    google-chrome --disable-web-security --user-data-dir="/tmp/chrome_dev" # on Linux
    ```
    or
    ```powershell
    & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --disable-web-security --user-data-dir=\ # on Windows
    ```

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