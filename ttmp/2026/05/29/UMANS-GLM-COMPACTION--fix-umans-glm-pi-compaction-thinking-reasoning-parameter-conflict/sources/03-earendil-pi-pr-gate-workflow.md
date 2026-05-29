---
Title: Source - Earendil Pi PR Gate Workflow
DocType: source
Ticket: UMANS-GLM-COMPACTION
Status: active
Intent: long-term
Topics:
  - pi
  - compaction
  - provider-compatibility
SourceUrl: https://github.com/earendil-works/pi/blob/main/.github/workflows/pr-gate.yml
CapturedWith: defuddle
Created: 2026-05-29
Updated: 2026-05-29
---

1

2

3

4

5

6

7

8

9

10

11

12

13

14

15

16

17

18

19

20

21

22

23

24

25

26

27

28

29

30

31

32

33

34

35

36

37

38

39

40

41

42

43

44

45

46

47

48

49

50

51

52

53

54

55

56

57

58

59

60

61

62

63

64

65

66

67

68

69

70

71

72

73

74

75

76

77

78

79

80

81

82

83

84

85

86

87

88

89

90

91

92

93

94

95

96

97

98

99

100

101

102

103

104

105

106

107

108

109

110

111

112

113

114

115

116

117

118

119

120

121

122

123

124

125

126

name: PR Gate

on:

pull\_request\_target:

types: \[opened\]

jobs:

check-contributor:

runs-on: ubuntu-latest

permissions:

contents: read

issues: write

pull-requests: write

steps:

\- name: Check if contributor is approved

uses: actions/github-script@v7

with:

script: |

const APPROVED\_FILE = '.github/APPROVED\_CONTRIBUTORS';

const VALID\_CAPABILITIES = new Set(\['issue', 'pr'\]);

const defaultBranch = context.payload.repository.default\_branch;

if (prAuthor.endsWith('\[bot\]') || prAuthor === 'dependabot\[bot\]') {

console.log(\`Skipping bot: ${prAuthor}\`);

return;

}

async function getPermission(username) {

try {

const { data: permissionLevel } = await github.rest.repos.getCollaboratorPermissionLevel({

owner: context.repo.owner,

repo: context.repo.repo,

username,

});

return permissionLevel.permission;

} catch {

return null;

}

}

async function getTextFile(path) {

const { data: fileContent } = await github.rest.repos.getContent({

owner: context.repo.owner,

repo: context.repo.repo,

path,

ref: defaultBranch,

});

if (!('content' in fileContent) || typeof fileContent.content!== 'string') {

throw new Error(\`Expected file content for ${path}\`);

}

return Buffer.from(fileContent.content, 'base64').toString('utf8');

}

function parseApprovedUsers(content) {

const users = new Map();

for (const rawLine of content.split('\\n')) {

const line = rawLine.trim();

if (!line || line.startsWith('#')) continue;

const parts = line.split(/\\s+/);

if (parts.length!== 2) {

console.log(\`Skipping malformed line: ${rawLine}\`);

continue;

}

const \[username, capability\] = parts;

const normalizedCapability = capability.toLowerCase();

if (!VALID\_CAPABILITIES.has(normalizedCapability)) {

console.log(\`Skipping line with invalid capability: ${rawLine}\`);

continue;

}

users.set(username.toLowerCase(), normalizedCapability);

}

return users;

}

async function closePullRequest(message) {

await github.rest.issues.createComment({

owner: context.repo.owner,

repo: context.repo.repo,

issue\_number: context.payload.pull\_request.number,

body: message,

});

await github.rest.pulls.update({

owner: context.repo.owner,

repo: context.repo.repo,

pull\_number: context.payload.pull\_request.number,

state: 'closed',

});

}

const permission = await getPermission(prAuthor);

if (\['admin', 'maintain', 'write'\].includes(permission)) {

console.log(\`${prAuthor} is a collaborator with ${permission} access\`);

return;

}

const approvedContent = await getTextFile(APPROVED\_FILE);

const approvedUsers = parseApprovedUsers(approvedContent);

const capability = approvedUsers.get(prAuthor.toLowerCase());

if (capability === 'pr') {

console.log(\`${prAuthor} is approved for PRs\`);

return;

}

console.log(\`${prAuthor} is not approved, closing PR\`);

const message = \[

'This PR was auto-closed. Only contributors approved with \`lgtm\` can open PRs. Open an issue first.',

'',

\`Maintainers review auto-closed issues daily. Issues that do not meet the quality bar in \[CONTRIBUTING.md\](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${defaultBranch}/CONTRIBUTING.md) will not be reopened or receive a reply.\`,

'',

'If a maintainer replies \`lgtmi\`, your future issues will stay open. If a maintainer replies \`lgtm\`, your future issues and PRs will stay open.',

'',

\`See \[CONTRIBUTING.md\](https://github.com/${context.repo.owner}/${context.repo.repo}/blob/${defaultBranch}/CONTRIBUTING.md).\`,

\].join('\\n');

await closePullRequest(message);