const main = async () => {
    try {
        const fetch = (await import('node-fetch')).default;
    } catch (e) {
        // use global fetch if available (Node 18+)
    }

    const projectId = 'test-proj-' + Date.now();
    console.log(`Creating pipeline for ${projectId}...`);

    const res = await fetch('http://localhost:3000/pipeline/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            description: "A simple E-commerce website for selling shoes."
        })
    });

    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (res.status === 200 && data.currentPhase === 'IDLE') {
        console.log('✅ Pipeline created successfully!');
    } else {
        console.error('❌ Pipeline creation failed.');
    }
};

main();
