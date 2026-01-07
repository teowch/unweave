import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import axios from 'axios';

// Import API methods
import {
    getHistory,
    processUrl,
    downloadStem,
    unifyStems,
    downloadZip,
    downloadSelectedZip,
    API_BASE
} from '../api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer);
        });
    });
}

async function testGetHistory() {
    console.log('\n📋 Getting track history...');
    try {
        const data = await getHistory();
        console.log('✅ Success! Found', data.length, 'tracks:');
        data.forEach((track, idx) => {
            console.log(`  ${idx + 1}. ${track.name} (${track.stems.length} stems)`);
        });
        return data;
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testProcessFile() {
    const filePath = await question('Enter file path: ');

    if (!fs.existsSync(filePath)) {
        console.error('❌ File not found');
        return;
    }

    console.log('\n🎵 Uploading and processing file...');
    try {
        // Node.js version - can't use processFile from api.js because it expects browser File object
        // Use direct axios call with FormData
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(`${API_BASE}/process`, formData, {
            headers: formData.getHeaders()
        });

        console.log('✅ Success! Track ID:', response.data.id);
        console.log('  Created stems:', response.data.stems.length);
        response.data.stems.forEach(stem => console.log(`    - ${stem}`));
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testProcessUrl() {
    const url = await question('Enter YouTube or audio URL: ');

    console.log('\n🎬 Downloading and processing from URL...');
    try {
        const data = await processUrl(url);
        console.log('✅ Success! Track ID:', data.id);
        console.log('  Created stems:', data.stems.length);
        data.stems.forEach(stem => console.log(`    - ${stem}`));
        return data;
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testDownloadFile() {
    const trackId = await question('Enter track ID: ');
    const stemName = await question('Enter stem filename: ');

    console.log('\n💾 Downloading file...');
    try {
        const blob = await downloadStem(trackId, stemName);

        // Convert blob to buffer and save
        const buffer = Buffer.from(await blob.arrayBuffer());
        const outputPath = path.join(__dirname, stemName);
        fs.writeFileSync(outputPath, buffer);
        console.log('✅ Success! File saved to:', outputPath);
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testUnifyStems() {
    const trackId = await question('Enter track ID: ');
    const stemsInput = await question('Enter stem names (comma separated): ');
    const stems = stemsInput.split(',').map(s => s.trim());

    console.log('\n🎚️ Unifying stems...');
    try {
        const data = await unifyStems(trackId, stems);
        console.log('✅ Success! Created:', data.new_track);
        return data;
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testDownloadZip() {
    const trackId = await question('Enter track ID: ');

    console.log('\n📦 Downloading full ZIP...');
    try {
        const blob = await downloadZip(trackId);

        // Convert blob to buffer and save
        const buffer = Buffer.from(await blob.arrayBuffer());
        const outputPath = path.join(__dirname, `${trackId}.zip`);
        fs.writeFileSync(outputPath, buffer);
        console.log('✅ Success! ZIP saved to:', outputPath);
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testDownloadSelectedZip() {
    const trackId = await question('Enter track ID: ');
    const stemsInput = await question('Enter stem names (comma separated): ');
    const stems = stemsInput.split(',').map(s => s.trim());

    console.log('\n📦 Downloading selected ZIP...');
    try {
        const blob = await downloadSelectedZip(trackId, stems);

        // Convert blob to buffer and save
        const buffer = Buffer.from(await blob.arrayBuffer());
        const outputPath = path.join(__dirname, `${trackId}_selected.zip`);
        fs.writeFileSync(outputPath, buffer);
        console.log('✅ Success! ZIP saved to:', outputPath);
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function testRunAdditionalModules() {
    const trackId = await question('Enter track ID: ');
    const modulesInput = await question('Enter module names (comma separated): ');
    const modules = modulesInput.split(',').map(s => s.trim());

    console.log('\n🔄 Running additional modules...');
    try {
        const response = await axios.post(`${API_BASE}/project/${trackId}/run-modules`, {
            modules: modules
        });

        console.log('✅ Success!');
        console.log('  Executed modules:', response.data.executed_modules);
        console.log('  Stems:', response.data.stems?.length);
        response.data.stems?.forEach(stem => console.log(`    - ${stem}`));
        return response.data;
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

async function showMenu() {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║   🎵 Track Splitter API Test CLI    ║');
    console.log('╚════════════════════════════════════╝');
    console.log('\nSelect a test to run:\n');
    console.log('  1. Get History');
    console.log('  2. Upload & Process File');
    console.log('  3. Process from URL');
    console.log('  4. Download Stem File');
    console.log('  5. Unify Stems');
    console.log('  6. Download Full ZIP');
    console.log('  7. Download Selected ZIP');
    console.log('  8. Run Additional Modules');
    console.log('  0. Exit\n');
}

async function main() {
    let running = true;

    while (running) {
        await showMenu();
        const choice = await question('Enter your choice: ');

        switch (choice) {
            case '1':
                await testGetHistory();
                break;
            case '2':
                await testProcessFile();
                break;
            case '3':
                await testProcessUrl();
                break;
            case '4':
                await testDownloadFile();
                break;
            case '5':
                await testUnifyStems();
                break;
            case '6':
                await testDownloadZip();
                break;
            case '7':
                await testDownloadSelectedZip();
                break;
            case '8':
                await testRunAdditionalModules();
                break;
            case '0':
                console.log('\n👋 Goodbye!');
                running = false;
                break;
            default:
                console.log('\n❌ Invalid choice. Please try again.');
        }

        if (running) {
            await question('\nPress Enter to continue...');
        }
    }

    rl.close();
}

main();