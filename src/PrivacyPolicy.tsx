import React from 'react';

const PrivacyPolicy: React.FC = () => (
  <div className="min-h-screen bg-[#070708] text-slate-300 p-10 font-sans">
    <div className="max-w-3xl mx-auto bg-[#111113] p-8 rounded-3xl border border-slate-800/40">
      <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
      <p className="mb-4">Last Updated: June 1, 2026</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">1. Information We Collect</h2>
      <p className="mb-4">When you use OutreachPro, we collect your email address and OAuth2 tokens via Google Sign-In to facilitate automated email sending on your behalf.</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">2. How We Use Information</h2>
      <p className="mb-4">We use your information strictly to provide the email outreach service. This includes authenticating with Google and sending emails to your specified recipients.</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">3. Data Security</h2>
      <p className="mb-4">Your tokens are stored in a secure database. We do not share your personal information or email data with third parties.</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">4. Your Rights</h2>
      <p className="mb-4">You can disconnect your account at any time, which will remove your tokens from our database.</p>
      
      <div className="mt-8 border-t border-slate-800 pt-6">
        <a href="/" className="text-indigo-400 hover:text-indigo-300 font-bold underline">Back to Dashboard</a>
      </div>
    </div>
  </div>
);

export default PrivacyPolicy;
