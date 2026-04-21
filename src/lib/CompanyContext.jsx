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
    // Nova empresa começa travada aguardando o PIN que o super-admin vai
    // fornecer — ela só vira "active" quando a empresa resgatar um PIN
    // válido na tela CompanyAccessLock.
    const newCompany = await base44.entities.Company.create({
      ...data,
      owner_email: user.email,
      status: "pending_pin",
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

  // Aplica localmente uma atualização parcial vinda de um resgate de PIN
  // sem precisar refazer a request ao base44 (a tela de lock já fez).
  const patchCompany = (patch) => {
    setCompany(prev => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <CompanyContext.Provider value={{ company, companyId, loading, createCompany, refreshCompany, patchCompany }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
};