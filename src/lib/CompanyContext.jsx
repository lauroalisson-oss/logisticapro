import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const CompanyContext = createContext();

export const CompanyProvider = ({ children }) => {
  const [company, setCompany] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) { setLoading(false); return; }

      // company_id is stored on the user record
      if (user.company_id) {
        const companies = await base44.entities.Company.filter({ id: user.company_id });
        if (companies.length > 0) {
          setCompany(companies[0]);
          setCompanyId(companies[0].id);
        }
      }
    } catch (e) {
      // not authenticated yet — ignore
    }
    setLoading(false);
  };

  const createCompany = async (data) => {
    const user = await base44.auth.me();
    const newCompany = await base44.entities.Company.create({
      ...data,
      owner_email: user.email,
    });
    // Save company_id on the current user
    await base44.auth.updateMe({ company_id: newCompany.id });
    setCompany(newCompany);
    setCompanyId(newCompany.id);
    return newCompany;
  };

  const refreshCompany = async () => {
    await init();
  };

  return (
    <CompanyContext.Provider value={{ company, companyId, loading, createCompany, refreshCompany }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
};