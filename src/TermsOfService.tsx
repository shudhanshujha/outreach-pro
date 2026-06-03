import React from 'react';

const TermsOfService: React.FC = () => (
  <div className="min-h-screen bg-[#070708] text-slate-300 p-10 font-sans">
    <div className="max-w-3xl mx-auto bg-[#111113] p-8 rounded-3xl border border-slate-800/40">
      <h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
      <p className="mb-4">Last Updated: June 1, 2026</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">1. Acceptance of Terms</h2>
      <p className="mb-4">By using OutreachPro, you agree to comply with these terms. You must be at least 18 years old to use this service.</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">2. Service Usage</h2>
      <p className="mb-4">You agree not to use the service for spamming, harassment, or any illegal activities. You are responsible for the content of the emails you send.</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">3. Account Safety</h2>
      <p className="mb-4">You are responsible for maintaining the security of your Google account connection.</p>
      
      <h2 className="text-xl font-bold text-white mt-6 mb-3">4. Limitation of Liability</h2>
      <p className="mb-4">OutreachPro is provided "as is". We are not responsible for any issues resulting from the use of the service, including account suspension by Google.</p>
      
      <div className="mt-8 border-t border-slate-800 pt-6">
        <a href="/" className="text-indigo-400 hover:text-indigo-300 font-bold underline">Back to Dashboard</a>
      </div>
    </div>
  </div>
);

export default TermsOfService;
