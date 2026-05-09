export const DIRENV_BASH_MARKER_BEGIN = "# PI_DIRENV_BASH_BEGIN v1";
export const DIRENV_BASH_MARKER_END = "# PI_DIRENV_BASH_END v1";

export interface DirenvBashOptions {
	quiet?: boolean;
	strict?: boolean;
}

/**
 * Build a shell preamble that imports direnv's environment for the shell's cwd.
 *
 * `direnv export bash` prints shell code for the current directory. Evaluating
 * that output in the same shell process makes the subsequent command observe
 * the variables from the nearest allowed .envrc.
 */
export function buildDirenvBashPreamble(options: DirenvBashOptions = {}): string {
	const stderrRedirect = options.quiet ? " 2>/dev/null" : "";
	const missingDirenv = options.strict
		? "  echo 'direnv-bash: direnv not found on PATH' >&2\n  exit 127"
		: "  :";
	const failedExport = options.strict
		? "  echo 'direnv-bash: direnv export bash failed' >&2\n  exit 1"
		: "  :";

	return [
		DIRENV_BASH_MARKER_BEGIN,
		"if command -v direnv >/dev/null 2>&1; then",
		`  __pi_direnv_export=\"$(direnv export bash${stderrRedirect})\"`,
		"  __pi_direnv_status=$?",
		"  if [ $__pi_direnv_status -eq 0 ]; then",
		"    eval \"$__pi_direnv_export\"",
		"  else",
		failedExport,
		"  fi",
		"  unset __pi_direnv_export __pi_direnv_status",
		"else",
		missingDirenv,
		"fi",
		DIRENV_BASH_MARKER_END,
	].join("\n");
}

export function commandHasDirenvBashPreamble(command: string): boolean {
	return command.includes(DIRENV_BASH_MARKER_BEGIN) && command.includes(DIRENV_BASH_MARKER_END);
}

export function injectDirenvBashPreamble(command: string, preamble: string): string {
	if (commandHasDirenvBashPreamble(command)) return command;
	return `${preamble}\n${command}`;
}

export interface DirenvBashSelfTest {
	name: string;
	ok: boolean;
	details: string;
}

export function runInternalSelfTests(): DirenvBashSelfTest[] {
	const preamble = buildDirenvBashPreamble();
	const injected = injectDirenvBashPreamble("printf ok", preamble);
	const reinjected = injectDirenvBashPreamble(injected, preamble);
	const quiet = buildDirenvBashPreamble({ quiet: true });
	const strict = buildDirenvBashPreamble({ strict: true });

	return [
		{
			name: "preamble has begin/end markers",
			ok: preamble.startsWith(DIRENV_BASH_MARKER_BEGIN) && preamble.endsWith(DIRENV_BASH_MARKER_END),
			details: "idempotence markers are present",
		},
		{
			name: "preamble calls direnv export bash",
			ok: preamble.includes("direnv export bash"),
			details: "uses direnv's supported shell-code export interface",
		},
		{
			name: "injection is idempotent",
			ok: injected === reinjected,
			details: "a command that already contains the marker is not wrapped twice",
		},
		{
			name: "quiet mode redirects direnv stderr",
			ok: quiet.includes("direnv export bash 2>/dev/null"),
			details: "quiet mode can avoid unapproved .envrc noise in command output",
		},
		{
			name: "strict mode fails when direnv is missing/export fails",
			ok: strict.includes("exit 127") && strict.includes("exit 1"),
			details: "strict mode makes direnv failures visible as command failures",
		},
	];
}
