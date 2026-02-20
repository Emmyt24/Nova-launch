import { ipfsService } from './IPFSService';

/**
 * Example: Upload token metadata with image
 */
async function uploadTokenMetadata() {
    const imageFile = new File(['...'], 'token-logo.png', { type: 'image/png' });
    const description = 'My awesome token for the community';
    const tokenName = 'Awesome Token';

    try {
        const metadataUri = await ipfsService.uploadMetadata(
            imageFile,
            description,
            tokenName
        );
        console.log('Metadata uploaded:', metadataUri);
        // Returns: ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    } catch (error) {
        console.error('Upload failed:', error);
    }
}

/**
 * Example: Fetch metadata from IPFS
 */
async function fetchTokenMetadata() {
    const uri = 'ipfs://QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    try {
        const metadata = await ipfsService.getMetadata(uri);
        console.log('Token Name:', metadata.name);
        console.log('Description:', metadata.description);
        console.log('Image URI:', metadata.image);
        
        // Metadata structure:
        // {
        //   name: "Awesome Token",
        //   description: "My awesome token for the community",
        //   image: "ipfs://QmYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"
        // }
    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

/**
 * Example: Use in token deployment flow
 */
async function deployTokenWithMetadata() {
    const imageFile = document.querySelector<HTMLInputElement>('#token-image')?.files?.[0];
    
    if (!imageFile) {
        throw new Error('No image selected');
    }

    // Step 1: Upload metadata to IPFS
    const metadataUri = await ipfsService.uploadMetadata(
        imageFile,
        'Community governance token',
        'MyToken'
    );

    // Step 2: Use metadataUri in token deployment
    // (This would be passed to the smart contract)
    console.log('Deploy token with metadata URI:', metadataUri);
}

/**
 * Example: Display token metadata in UI
 */
async function displayTokenInfo(tokenAddress: string, metadataUri: string) {
    try {
        const metadata = await ipfsService.getMetadata(metadataUri);
        
        // Convert IPFS URI to HTTP URL for display
        const imageUrl = metadata.image.replace(
            'ipfs://',
            'https://gateway.pinata.cloud/ipfs/'
        );

        // Update UI
        document.querySelector('#token-name')!.textContent = metadata.name;
        document.querySelector('#token-description')!.textContent = metadata.description;
        document.querySelector<HTMLImageElement>('#token-image')!.src = imageUrl;
    } catch (error) {
        console.error('Failed to load token metadata:', error);
    }
}

export {
    uploadTokenMetadata,
    fetchTokenMetadata,
    deployTokenWithMetadata,
    displayTokenInfo,
};
