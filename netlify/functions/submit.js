const https = require('https');

// GitHub API 設定
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // 格式: owner/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const VENDOR_FILE = process.env.VENDOR_FILE || 'data/vendors.json';
const BOOTH_FILE = process.env.BOOTH_FILE || 'data/booths.json';
const SCHEDULE_FILE = process.env.SCHEDULE_FILE || 'data/schedule.json';

exports.handler = async (event, context) => {
    // 只允許 POST 請求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: '只允許 POST 請求' })
        };
    }

    try {
        // 解析請求資料
        const { vendor_id, booth_location, date } = JSON.parse(event.body);

        // 1️⃣ 驗證欄位
        if (!vendor_id || !booth_location || !date) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: '請填寫所有必填欄位' })
            };
        }

        // 驗證日期格式
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: '日期格式不正確' })
            };
        }

        // 2️⃣ 從 GitHub 載入資料檔案
        const [vendorsData, boothsData, scheduleData] = await Promise.all([
            getFileFromGitHub(VENDOR_FILE),
            getFileFromGitHub(BOOTH_FILE),
            getFileFromGitHub(SCHEDULE_FILE)
        ]);

        const vendors = JSON.parse(vendorsData.content);
        let booths = JSON.parse(boothsData.content);
        let schedule = JSON.parse(scheduleData.content);

        // 3️⃣ 找出攤主名稱
        const vendor = vendors.find(v => v.vendor_id === vendor_id);
        if (!vendor) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: '找不到該攤主' })
            };
        }
        const vendor_name = vendor.vendor_name;

        // 4️⃣ 檢查並處理攤位地點
        let booth = booths.find(b => b.booth_location === booth_location);
        let isNewBooth = false;

        if (!booth) {
            // 新增新地點
            booth = {
                booth_location: booth_location,
                booth_name: booth_location
            };
            booths.push(booth);
            isNewBooth = true;
        }
        const booth_name = booth.booth_name;

        // 5️⃣ 檢查重複
        // 檢查同攤主 + 日期
        const duplicateVendor = schedule.find(
            s => s.vendor_id === vendor_id && s.date === date
        );
        if (duplicateVendor) {
            return {
                statusCode: 409,
                body: JSON.stringify({ 
                    error: `攤主「${vendor_name}」已在 ${date} 登記過了（地點：${duplicateVendor.booth_location}）` 
                })
            };
        }

        // 檢查同地點 + 日期
        const duplicateBooth = schedule.find(
            s => s.booth_location === booth_location && s.date === date
        );
        if (duplicateBooth) {
            return {
                statusCode: 409,
                body: JSON.stringify({ 
                    error: `攤位「${booth_location}」在 ${date} 已被登記（攤主：${duplicateBooth.vendor_name}）` 
                })
            };
        }

        // 6️⃣ 新增紀錄
        const newRecord = {
            vendor_id,
            vendor_name,
            booth_location,
            booth_name,
            date,
            submitted_at: new Date().toISOString()
        };
        schedule.push(newRecord);

        // 7️⃣ Commit 至 GitHub
        const filesToUpdate = [
            {
                path: SCHEDULE_FILE,
                content: JSON.stringify(schedule, null, 2),
                sha: scheduleData.sha
            }
        ];

        // 如果有新攤位，也要更新 booths.json
        if (isNewBooth) {
            filesToUpdate.push({
                path: BOOTH_FILE,
                content: JSON.stringify(booths, null, 2),
                sha: boothsData.sha
            });
        }

        // 執行 commit
        await commitToGitHub(filesToUpdate, `新增登記: ${vendor_name} - ${booth_location} (${date})`);

        // 8️⃣ 回傳成功
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `✅ 登記成功！${vendor_name} - ${booth_location} (${date})`,
                data: newRecord,
                newBoothAdded: isNewBooth
            })
        };

    } catch (error) {
        console.error('處理錯誤:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: '伺服器錯誤',
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
                    // Base64 解碼
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
    // 1. 取得最新的 commit SHA
    const latestCommitSha = await getLatestCommitSha();

    // 2. 取得該 commit 的 tree SHA
    const baseTreeSha = await getTreeSha(latestCommitSha);

    // 3. 建立新的 tree
    const treeItems = files.map(file => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content
    }));

    const newTreeSha = await createTree(treeItems, baseTreeSha);

    // 4. 建立新的 commit
    const newCommitSha = await createCommit(message, newTreeSha, latestCommitSha);

    // 5. 更新 branch reference
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
