// Positive replies for 4-5 star reviews
const positiveReplies = [
  "Thank you for trusting Usmanpura Imaging Centre—your health is always our top priority.",
  "We're truly grateful for your kind words—it motivates our entire team to serve you even better.",
  "Your appreciation means a lot to our team at Usmanpura Imaging Centre—thank you for choosing us.",
  "Delighted to know you had a great experience—we look forward to serving you again at UIC.",
  "Thank you for your feedback—it inspires us to maintain the highest standards of diagnostic care.",
  "We're glad we could make your experience smooth and comfortable—thank you for sharing.",
  "Your trust is our biggest achievement—thank you for choosing Usmanpura Imaging Centre.",
  "Happy to have exceeded your expectations—your feedback truly means everything to our team.",
  "Thank you for your kind recommendation—it helps us grow and serve more patients in Gujarat.",
  "We appreciate your valuable feedback and look forward to assisting you with your future healthcare needs."
];

// Negative replies for 1-3 star reviews
const negativeReplies = [
  "We're truly sorry for your experience at Usmanpura Imaging Centre—please allow us to make this right.",
  "Your feedback is important to us—we sincerely apologize and would like to resolve this immediately.",
  "We regret the inconvenience caused and are committed to improving your experience at our centre.",
  "This is not the standard we strive for at UIC—please connect with us so we can assist you personally.",
  "We apologize for your experience and would appreciate a chance to address your concerns.",
  "Your experience matters to us—please reach out to our centre manager so we can understand and resolve this.",
  "We're sorry to hear this and are actively working to ensure it doesn't happen again at our facility.",
  "Thank you for your feedback—we take it seriously and will work on immediate improvements.",
  "We regret your experience—kindly share details so we can look into this on priority and get back to you.",
  "Apologies for the inconvenience—we're here to support you and make things right. Please contact us directly."
];

let branchCounters = {};

function initBranchCounters(branches) {
  branches.forEach(branch => {
    branchCounters[branch.id] = {
      positive: 0,
      negative: 0
    };
  });
  console.log(`✅ Initialized counters for ${branches.length} branches`);
}

function getNextReply(rating, branchId) {
  const isPositive = rating >= 4;
  const replies = isPositive ? positiveReplies : negativeReplies;
  const counter = branchCounters[branchId][isPositive ? 'positive' : 'negative'];
  const nextIndex = counter % replies.length;
  
  branchCounters[branchId][isPositive ? 'positive' : 'negative'] = (counter + 1) % replies.length;
  
  return replies[nextIndex];
}

function getRoundRobinStatus() {
  const status = {};
  Object.keys(branchCounters).forEach(branchId => {
    status[branchId] = {
      positiveNext: branchCounters[branchId].positive + 1,
      negativeNext: branchCounters[branchId].negative + 1
    };
  });
  return status;
}

module.exports = {
  positiveReplies,
  negativeReplies,
  initBranchCounters,
  getNextReply,
  getRoundRobinStatus
};
