import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

// Standard dropdown options
const JOB_ROLES = [
  "Chief Executive Officer (CEO)",
  "Chief Technology Officer (CTO)",
  "Chief Financial Officer (CFO)",
  "Chief Marketing Officer (CMO)",
  "Chief Operating Officer (COO)",
  "Vice President",
  "Director",
  "Senior Manager",
  "Manager",
  "Team Lead",
  "Project Manager",
  "Product Manager",
  "Software Engineer",
  "Data Analyst",
  "Business Analyst",
  "Sales Executive",
  "Marketing Specialist",
  "Human Resources Specialist",
  "Customer Support Representative",
  "Other",
];

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "Manufacturing",
  "Retail",
  "Transportation",
  "Energy",
  "Telecommunications",
  "Media & Entertainment",
  "Real Estate",
  "Construction",
  "Agriculture",
  "Government",
  "Nonprofit",
  "Professional Services",
  "Insurance",
  "Automotive",
  "Pharmaceuticals",
  "Other",
];

const COUNTRIES = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Sweden",
  "Switzerland",
  "Japan",
  "China",
  "India",
  "Brazil",
  "Mexico",
  "South Africa",
  "Singapore",
  "United Arab Emirates",
  "New Zealand",
];

interface ProfileGateProps {
  onComplete: (profile: any) => void;
}

export function ProfileGate({ onComplete }: ProfileGateProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    companySize: "",
    jobTitle: "",
    industry: "",
    country: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all required fields
    const requiredFields = [
      { field: 'name', label: 'Name' },
      { field: 'email', label: 'Email' },
      { field: 'company', label: 'Company' },
      { field: 'jobTitle', label: 'Job Title' },
      { field: 'industry', label: 'Industry' },
      { field: 'companySize', label: 'Company Size' },
      { field: 'country', label: 'Country' },
    ];

    for (const { field, label } of requiredFields) {
      if (!formData[field as keyof typeof formData]?.trim()) {
        toast({
          title: "Required field missing",
          description: `${label} is required`,
          variant: "destructive",
        });
        return;
      }
    }
    
    console.log('Profile submitted:', formData);
    onComplete(formData);
  };

  return (
    <Card className="p-8 max-w-2xl mx-auto" data-testid="card-profile-gate">
      <h2 className="text-2xl font-bold mb-2">Complete Your Profile</h2>
      <p className="text-muted-foreground mb-6">
        To access your full results and receive your PDF report, please complete your profile.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            data-testid="input-name"
          />
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            data-testid="input-email"
          />
        </div>

        <div>
          <Label htmlFor="company">Company *</Label>
          <Input
            id="company"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            required
            data-testid="input-company"
          />
        </div>

        <div>
          <Label htmlFor="jobTitle">Job Title *</Label>
          <Select value={formData.jobTitle} onValueChange={(value) => setFormData({ ...formData, jobTitle: value })}>
            <SelectTrigger id="jobTitle" data-testid="select-job-title">
              <SelectValue placeholder="Select job title" />
            </SelectTrigger>
            <SelectContent>
              {JOB_ROLES.map((role) => (
                <SelectItem key={role} value={role}>{role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="industry">Industry *</Label>
          <Select value={formData.industry} onValueChange={(value) => setFormData({ ...formData, industry: value })}>
            <SelectTrigger id="industry" data-testid="select-industry">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((industry) => (
                <SelectItem key={industry} value={industry}>{industry}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="companySize">Company Size *</Label>
          <Select value={formData.companySize} onValueChange={(value) => setFormData({ ...formData, companySize: value })}>
            <SelectTrigger id="companySize" data-testid="select-company-size">
              <SelectValue placeholder="Select company size" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Sole Proprietor (1)</SelectItem>
              <SelectItem value="2-9">Small Team (2-9)</SelectItem>
              <SelectItem value="10-49">Small Business (10-49)</SelectItem>
              <SelectItem value="50-249">Medium Business (50-249)</SelectItem>
              <SelectItem value="250-999">Large Business (250-999)</SelectItem>
              <SelectItem value="1000-9999">Enterprise (1,000-9,999)</SelectItem>
              <SelectItem value="10000+">Large Enterprise (10,000+)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="country">Country *</Label>
          <Select value={formData.country} onValueChange={(value) => setFormData({ ...formData, country: value })}>
            <SelectTrigger id="country" data-testid="select-country">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((country) => (
                <SelectItem key={country} value={country}>{country}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" className="w-full" data-testid="button-complete-profile">
          Access Results
        </Button>
      </form>
    </Card>
  );
}
