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
    // Criação feita no backend: o servidor força status "pending_pin",
    // define owner_email e vincula o usuário — o cliente não escreve na
    // entidade Company diretamente (senão daria para nascer já "active" e
    // burlar a licença).
    const res = await base44.functions.invoke("createCompany", data);
    const newCompany = res.data?.company;
    if (!newCompany) throw new Error(res.data?.error || "Erro ao criar empresa.");
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