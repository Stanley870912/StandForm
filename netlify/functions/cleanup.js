const https = require('https');

// GitHub API 設定
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // 格式: owner/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SCHEDULE_FILE = process.env.SCHEDULE_FILE || 'data/schedule.json';

exports.handler = async (event, context) => {
    try {
        // 從 GitHub 載入資料檔案
        const scheduleData = await getFileFromGitHub(SCHEDULE_FILE);
        let schedule = JSON.parse(scheduleData.content);

        const originalCount = schedule.length;

        // 計算一個月前的日期
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // 只保留一個月內的資料
        schedule = schedule.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= oneMonthAgo;
        });

        const newCount = schedule.length;
        const deletedCount = originalCount - newCount;

        // 如果有資料被刪除，則更新檔案
        if (deletedCount > 0) {
            const filesToUpdate = [
                {
                    path: SCHEDULE_FILE,
                    content: JSON.stringify(schedule, null, 2),
                    sha: scheduleData.sha
                }
            ];

            await commitToGitHub(
                filesToUpdate,
                `清理舊資料: 刪除 ${deletedCount} 筆超過一個月的紀錄`
            );

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: `成功清理 ${deletedCount} 筆舊資料`,
                    deleted: deletedCount,
                    remaining: newCount
                })
            };
        } else {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: '無需清理，所有資料都在一個月內',
                    deleted: 0,
                    remaining: newCount
                })
            };
        }

    } catch (error) {
        console.error('清理錯誤:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '清理失敗',
                details: error.message 
            })
        };
    }
};

// 從 GitHub 取得檔案
async function getFileFromGitHub(filePath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Netlify-Function',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const fileData = JSON.parse(data);
                    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                    resolve({
                        content,
                        sha: fileData.sha
                    });
                } else {
                    reject(new Error(`GitHub API 錯誤: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

// Commit 到 GitHub
async function commitToGitHub(files, message) {
    const latestCommitSha = await getLatestCommitSha();
    const baseTreeSha = await getTreeSha(latestCommitSha);

    const treeItems = files.map(file => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content
    }));

    const newTreeSha = await createTree(treeItems, baseTreeSha);
    const newCommitSha = await createCommit(message, newTreeSha, latestCommitSha);
    await updateReference(newCommitSha);

    return newCommitSha;
}

// 取得最新 commit SHA
function getLatestCommitSha() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Netlify-Function',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const ref = JSON.parse(data);
                    resolve(ref.object.sha);
                } else {
                    reject(new Error(`取得 commit SHA 失敗: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// 取得 tree SHA
function getTreeSha(commitSha) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/git/commits/${commitSha}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Netlify-Function',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const commit = JSON.parse(data);
                    resolve(commit.tree.sha);
                } else {
                    reject(new Error(`取得 tree SHA 失敗: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// 建立新 tree
function createTree(items, baseTree) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            base_tree: baseTree,
            tree: items
        });

        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/git/trees`,
            method: 'POST',
            headers: {
                'User-Agent': 'Netlify-Function',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 201) {
                    const tree = JSON.parse(data);
                    resolve(tree.sha);
                } else {
                    reject(new Error(`建立 tree 失敗: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 建立 commit
function createCommit(message, treeSha, parentSha) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            message: message,
            tree: treeSha,
            parents: [parentSha]
        });

        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/git/commits`,
            method: 'POST',
            headers: {
                'User-Agent': 'Netlify-Function',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 201) {
                    const commit = JSON.parse(data);
                    resolve(commit.sha);
                } else {
                    reject(new Error(`建立 commit 失敗: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 更新 reference
function updateReference(commitSha) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            sha: commitSha,
            force: false
        });

        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`,
            method: 'PATCH',
            headers: {
                'User-Agent': 'Netlify-Function',
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`更新 reference 失敗: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}
