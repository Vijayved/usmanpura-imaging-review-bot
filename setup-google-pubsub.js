const { PubSub } = require('@google-cloud/pubsub');
const axios = require('axios');

// Initialize Pub/Sub
const pubSubClient = new PubSub({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS)
});

async function setupGoogleReviewWebhook() {
    const topicName = 'google-reviews';
    const subscriptionName = 'uic-review-subscription';
    const webhookUrl = `${process.env.RENDER_URL}/api/webhook/google-review`;
    
    // Create topic if it doesn't exist
    const [topic] = await pubSubClient.createTopic(topicName);
    console.log(`Topic ${topic.name} created.`);
    
    // Create subscription
    const [subscription] = await topic.createSubscription(subscriptionName, {
        pushConfig: {
            pushEndpoint: webhookUrl
        }
    });
    
    console.log(`Subscription ${subscription.name} created.`);
    console.log(`Push endpoint: ${webhookUrl}`);
    
    return { topic, subscription };
}

// Run setup
setupGoogleReviewWebhook().catch(console.error);
