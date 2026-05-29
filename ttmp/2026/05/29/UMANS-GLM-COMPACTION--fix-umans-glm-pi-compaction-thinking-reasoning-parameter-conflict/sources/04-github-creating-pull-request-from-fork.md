---
Title: Source - GitHub Creating Pull Request From Fork
DocType: source
Ticket: UMANS-GLM-COMPACTION
Status: active
Intent: long-term
Topics:
  - pi
  - compaction
  - provider-compatibility
SourceUrl: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork
CapturedWith: defuddle
Created: 2026-05-29
Updated: 2026-05-29
---

If your pull request compares your topic branch with a branch in the upstream repository as the base branch, then your topic branch is also called the "compare branch" of the pull request.

For example:

- Your topic branch (also known as “feature branch”) is the branch where you’re making your changes in your forked repository (e.g. `my-topic-branch`).
- The base branch is the branch in the upstream (central) repository that you want to merge your changes into (e.g. `main`).
- The pull request compares the changes proposed by the topic branch (`my-topic-branch`) with the base branch (`main`), so `my-topic-branch` is known as the “compare branch”.

For more information about pull request branches, including examples, see [Creating a pull request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request#changing-the-branch-range-and-destination-repository).

1. Navigate to the original repository where you created your fork.
2. Above the list of files, in the yellow banner, click **Compare & pull request** to create a pull request for the associated branch.
	![Screenshot of the banner above the list of files.](https://docs.github.com/assets/cb-34097/mw-1440/images/help/pull_requests/pull-request-compare-pull-request.webp)
3. On the page to create a new pull request, click **compare across forks**.
	![Screenshot of the page to open a pull request. The "compare across forks" link is outlined in dark orange.](https://docs.github.com/assets/cb-41260/mw-1440/images/help/pull_requests/compare-across-forks-link.webp)
4. In the "base branch" dropdown menu, select the branch of the upstream repository you'd like to merge changes into.
	![Screenshot of the page to open a new pull request. The dropdown menus for choosing the base repository and branch are outlined in dark orange.](https://docs.github.com/assets/cb-96536/mw-1440/images/help/pull_requests/choose-base-fork-and-branch.webp)
5. In the "head fork" dropdown menu, select your fork, then use the "compare branch" drop-down menu to select the branch you made your changes in.
	![Screenshot of the page to open a new pull request. The dropdown menus for choosing the head repository and compare branch are outlined in dark orange.](https://docs.github.com/assets/cb-96331/mw-1440/images/help/pull_requests/choose-head-fork-compare-branch.webp)
6. Type a title and description for your pull request.
7. On user-owned forks, if you want to allow anyone with push access to the upstream repository to make changes to your pull request, select **Allow edits from maintainers**.
8. To create a pull request that is ready for review, click **Create Pull Request**. To create a draft pull request, use the drop-down and select **Create Draft Pull Request**, then click **Draft Pull Request**. If you are the member of an organization, you may need to request access to draft pull requests from an organization owner. See [About pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests#draft-pull-requests).
- [Working with forks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks)
- [Allowing changes to a pull request branch created from a fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork)