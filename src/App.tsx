import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { APP_NAME } from "@/config/brand";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthLayout } from "@/layouts/auth-layout";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import { LoginPage } from "@/pages/login-page";
import { DashboardHome } from "@/pages/dashboard-home";
import { AnalyticsPage } from "@/pages/analytics-page";
import { CustomersListPage } from "@/pages/customers-list-page";
import { CustomerDetailPage } from "@/pages/customer-detail-page";
import { SettingsPage } from "@/pages/settings-page";
import { SeoSettingsPage } from "@/pages/seo-settings-page";
import { ProfilePage } from "@/pages/profile-page";
import { ProductsListPage } from "@/pages/products-list-page";
import { ProductEditPage } from "@/pages/product-edit-page";
import { CollectionsListPage } from "@/pages/collections-list-page";
import { CollectionEditPage } from "@/pages/collection-edit-page";
import { SizesListPage } from "@/pages/sizes-list-page";
import { SizeEditPage } from "@/pages/size-edit-page";
import { ColorsListPage } from "@/pages/colors-list-page";
import { ColorEditPage } from "@/pages/color-edit-page";
import { TagsListPage } from "@/pages/tags-list-page";
import { TagEditPage } from "@/pages/tag-edit-page";
import { VouchersListPage } from "@/pages/vouchers-list-page";
import { VoucherEditPage } from "@/pages/voucher-edit-page";
import { OrdersListPage } from "@/pages/orders-list-page";
import { OrderDetailPage } from "@/pages/order-detail-page";
import { ReviewsListPage } from "@/pages/reviews-list-page";
import { WishlistAdminPage } from "@/pages/wishlist-admin-page";
import { HeroSectionPage } from "@/pages/hero-section-page";
import { AnnouncementPage } from "@/pages/announcement-page";
import { HomeSectionsListPage } from "@/pages/home-sections-list-page";
import { HomeSectionEditPage } from "@/pages/home-section-edit-page";
import { DeliverySettingsPage } from "@/pages/delivery-settings-page";
import { HeaderNavMenuPage } from "@/pages/header-nav-menu-page";
import { ContactInquiriesListPage } from "@/pages/contact-inquiries-list-page";
import { ContactInquiryDetailPage } from "@/pages/contact-inquiry-detail-page";
import { NewsletterSubscriptionsListPage } from "@/pages/newsletter-subscriptions-list-page";
import { NewsletterSendPage } from "@/pages/newsletter-send-page";
import { NewsletterCampaignDetailPage } from "@/pages/newsletter-campaign-detail-page";
import { FOOTER_DASHBOARD_BASE } from "@/config/footer-dashboard";
import { FooterUpdatesPage } from "@/pages/footer-updates-page";
import { PolicyEditPage } from "@/pages/policy-edit-page";
import { AbandonedCartsPage } from "@/pages/abandoned-carts-page";
import { AuditLogPage } from "@/pages/audit-log-page";

function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function RedirectLegacyPolicyRoute() {
  const { policyId } = useParams<{ policyId: string }>();
  return <Navigate to={`${FOOTER_DASHBOARD_BASE}/${policyId ?? ""}`} replace />;
}

function GuestOnly() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/dashboard/hero" element={<HeroSectionPage />} />
          <Route path="/dashboard/announcement" element={<AnnouncementPage />} />
          <Route path="/dashboard/home-sections" element={<HomeSectionsListPage />} />
          <Route path="/dashboard/home-sections/:sectionId" element={<HomeSectionEditPage />} />
          <Route path="/dashboard/delivery" element={<DeliverySettingsPage />} />
          <Route path="/dashboard/header-menu" element={<HeaderNavMenuPage />} />
          <Route path={FOOTER_DASHBOARD_BASE} element={<FooterUpdatesPage />} />
          <Route path={`${FOOTER_DASHBOARD_BASE}/new`} element={<PolicyEditPage />} />
          <Route path={`${FOOTER_DASHBOARD_BASE}/:policyId`} element={<PolicyEditPage />} />
          <Route path="/dashboard/policies" element={<Navigate to={FOOTER_DASHBOARD_BASE} replace />} />
          <Route
            path="/dashboard/policies/new"
            element={<Navigate to={`${FOOTER_DASHBOARD_BASE}/new`} replace />}
          />
          <Route path="/dashboard/policies/:policyId" element={<RedirectLegacyPolicyRoute />} />
          <Route path="/dashboard/home" element={<Navigate to="/dashboard/hero" replace />} />
          <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
          <Route path="/dashboard/customers" element={<CustomersListPage />} />
          <Route path="/dashboard/customers/:customerId" element={<CustomerDetailPage />} />
          <Route path="/dashboard/settings" element={<SettingsPage />} />
          <Route path="/dashboard/seo" element={<SeoSettingsPage />} />
          <Route path="/dashboard/profile" element={<ProfilePage />} />
          <Route path="/dashboard/products" element={<ProductsListPage />} />
          <Route path="/dashboard/products/:productId" element={<ProductEditPage />} />
          <Route path="/dashboard/collections" element={<CollectionsListPage />} />
          <Route path="/dashboard/collections/:collectionId" element={<CollectionEditPage />} />
          <Route path="/dashboard/sizes" element={<SizesListPage />} />
          <Route path="/dashboard/sizes/:sizeId" element={<SizeEditPage />} />
          <Route path="/dashboard/colors" element={<ColorsListPage />} />
          <Route path="/dashboard/colors/:colorId" element={<ColorEditPage />} />
          <Route path="/dashboard/tags" element={<TagsListPage />} />
          <Route path="/dashboard/tags/:tagId" element={<TagEditPage />} />
          <Route path="/dashboard/vouchers" element={<VouchersListPage />} />
          <Route path="/dashboard/vouchers/:voucherId" element={<VoucherEditPage />} />
          <Route path="/dashboard/orders" element={<OrdersListPage />} />
          <Route path="/dashboard/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/dashboard/abandoned-carts" element={<AbandonedCartsPage />} />
          <Route path="/dashboard/audit-log" element={<AuditLogPage />} />
          <Route path="/dashboard/reviews" element={<ReviewsListPage />} />
          <Route path="/dashboard/contact-inquiries" element={<ContactInquiriesListPage />} />
          <Route path="/dashboard/contact-inquiries/:inquiryId" element={<ContactInquiryDetailPage />} />
          <Route path="/dashboard/newsletter" element={<NewsletterSubscriptionsListPage />} />
          <Route path="/dashboard/newsletter/send" element={<NewsletterSendPage />} />
          <Route path="/dashboard/newsletter/campaigns/:campaignId" element={<NewsletterCampaignDetailPage />} />
          <Route path="/dashboard/wishlist" element={<WishlistAdminPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    document.title = `${APP_NAME} — Admin`;
  }, []);

  return (
    <BrowserRouter>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <AppRoutes />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
