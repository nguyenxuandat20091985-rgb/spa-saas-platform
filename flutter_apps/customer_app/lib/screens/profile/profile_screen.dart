import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import '../../bloc/profile/profile_bloc.dart';
import '../../bloc/profile/profile_event.dart';
import '../../bloc/profile/profile_state.dart';
import '../../bloc/auth/auth_bloc.dart';
import '../../bloc/auth/auth_event.dart';
import '../../widgets/profile_stat.dart';
import '../../widgets/section_card.dart';
import '../../widgets/membership_tier.dart';
import '../../widgets/menu_item.dart';
import '../../screens/auth/login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const LoadProfileEvent());
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Profile',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => _navigateToSettings(context),
          ),
        ],
      ),
      body: BlocConsumer<ProfileBloc, ProfileState>(
        listener: (context, state) {
          if (state is ProfileError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is ProfileLoading && state.isInitial) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          final profile = state is ProfileLoaded ? state.profile : null;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // Profile Card
                _buildProfileCard(profile, state),

                const SizedBox(height: 24),

                // Membership Tiers
                _buildMembershipSection(profile, state),

                const SizedBox(height: 16),

                // Loyalty & Voucher
                _buildLoyaltySection(profile, state),

                const SizedBox(height: 16),

                // Menu
                _buildMenuSection(context),

                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildProfileCard(dynamic profile, ProfileState state) {
    final fullName = profile?.fullName ?? 'Khách hàng';
    final email = profile?.email ?? '';
    final phone = profile?.phone ?? '';
    final tier = profile?.membershipTier ?? 'Member';
    final totalSpent = profile?.totalSpent ?? 0;
    final visitCount = profile?.visitCount ?? 0;
    final loyaltyPoints = profile?.loyaltyPoints ?? 0;
    final avatarUrl = profile?.avatarUrl;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF2C3E50), Color(0xFF4A6B8A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          // Avatar with edit button
          Stack(
            children: [
              CircleAvatar(
                radius: 44,
                backgroundColor: Colors.white24,
                child: avatarUrl != null
                    ? ClipOval(
                        child: CachedNetworkImage(
                          imageUrl: avatarUrl,
                          width: 88,
                          height: 88,
                          fit: BoxFit.cover,
                          placeholder: (context, url) => const Icon(
                            Icons.person,
                            color: Colors.white,
                            size: 40,
                          ),
                          errorWidget: (context, url, error) => const Icon(
                            Icons.person,
                            color: Colors.white,
                            size: 40,
                          ),
                        ),
                      )
                    : const Icon(
                        Icons.person,
                        color: Colors.white,
                        size: 44,
                      ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.camera_alt,
                    color: Colors.white,
                    size: 16,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            fullName,
            style: GoogleFonts.playfairDisplay(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          if (email.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              email,
              style: GoogleFonts.inter(
                color: Colors.white70,
                fontSize: 13,
              ),
            ),
          ],
          if (phone.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              phone,
              style: GoogleFonts.inter(
                color: Colors.white60,
                fontSize: 13,
              ),
            ),
          ],
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: _getTierColor(tier).withOpacity(0.3),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _getTierColor(tier).withOpacity(0.5),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _getTierIcon(tier),
                  color: _getTierColor(tier),
                  size: 16,
                ),
                const SizedBox(width: 6),
                Text(
                  tier.toUpperCase(),
                  style: GoogleFonts.inter(
                    color: _getTierColor(tier),
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              ProfileStat(
                label: 'Tổng chi tiêu',
                value: AppFormatters.currency(totalSpent),
              ),
              Container(
                width: 1,
                height: 32,
                color: Colors.white24,
              ),
              ProfileStat(
                label: 'Lượt đến',
                value: '$visitCount',
              ),
              Container(
                width: 1,
                height: 32,
                color: Colors.white24,
              ),
              ProfileStat(
                label: 'Điểm',
                value: '$loyaltyPoints',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMembershipSection(dynamic profile, ProfileState state) {
    final tiers = state is MembershipLoaded ? state.tiers : <dynamic>[];
    final currentTier = profile?.membershipTier ?? 'Silver';
    final points = profile?.loyaltyPoints ?? 0;

    if (tiers.isEmpty) {
      return SectionCard(
        title: 'Membership',
        icon: Icons.card_membership,
        children: const [
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text('Chưa có hạng thành viên'),
          ),
        ],
      );
    }

    return SectionCard(
      title: 'Membership',
      icon: Icons.card_membership,
      children: [
        // Progress to next tier
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: _buildTierProgress(tiers, currentTier, points),
        ),
        // Tier list
        ...tiers.map((tier) => MembershipTier(
          name: tier.name,
          discount: tier.discountPercentage,
          icon: _getTierIcon(tier.name),
          color: _getTierColor(tier.name),
          isCurrent: tier.name.toLowerCase() == currentTier.toLowerCase(),
          minPoints: tier.minPoints,
        )),
      ],
    );
  }

  Widget _buildTierProgress(List<dynamic> tiers, String currentTier, int points) {
    // Find current tier index
    int currentIndex = 0;
    for (int i = 0; i < tiers.length; i++) {
      if (tiers[i].name.toLowerCase() == currentTier.toLowerCase()) {
        currentIndex = i;
        break;
      }
    }

    final currentTierData = tiers[currentIndex];
    final nextTierData = currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;

    final progress = nextTierData != null
        ? ((points - currentTierData.minPoints) /
            (nextTierData.minPoints - currentTierData.minPoints))
            .clamp(0.0, 1.0)
        : 1.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              currentTierData.name,
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
            if (nextTierData != null)
              Text(
                '${(progress * 100).toInt()}%',
                style: GoogleFonts.inter(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 8,
            backgroundColor: AppColors.divider,
            color: AppColors.primary,
          ),
        ),
        if (nextTierData != null) ...[
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${currentTierData.minPoints} pts',
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 11,
                ),
              ),
              Text(
                '${nextTierData.minPoints} pts',
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Cần thêm ${nextTierData.minPoints - points} điểm để lên ${nextTierData.name}',
            style: GoogleFonts.inter(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildLoyaltySection(dynamic profile, ProfileState state) {
    final points = profile?.loyaltyPoints ?? 0;
    final voucherCount = state is VouchersLoaded ? state.vouchers.length : 0;

    return SectionCard(
      title: 'Loyalty & Voucher',
      icon: Icons.card_giftcard,
      children: [
        ListTile(
          leading: const Icon(
            Icons.loyalty,
            color: AppColors.primary,
          ),
          title: const Text('Điểm thưởng'),
          subtitle: Text('$points điểm'),
          trailing: TextButton(
            onPressed: () => _navigateToLoyaltyHistory(context),
            child: const Text('Lịch sử'),
          ),
        ),
        ListTile(
          leading: const Icon(
            Icons.local_offer,
            color: AppColors.accent,
          ),
          title: const Text('Voucher'),
          subtitle: Text('$voucherCount voucher'),
          trailing: TextButton(
            onPressed: () => _navigateToVouchers(context),
            child: const Text('Xem tất cả'),
          ),
        ),
      ],
    );
  }

  Widget _buildMenuSection(BuildContext context) {
    return SectionCard(
      title: 'Menu',
      icon: Icons.menu,
      children: [
        MenuItem(
          icon: Icons.history,
          title: 'Lịch sử dịch vụ',
          onTap: () => _navigateToHistory(context),
        ),
        MenuItem(
          icon: Icons.shopping_bag,
          title: 'Đơn hàng',
          onTap: () => _navigateToOrders(context),
        ),
        MenuItem(
          icon: Icons.face,
          title: 'Hồ sơ da',
          onTap: () => _navigateToSkinRecords(context),
        ),
        MenuItem(
          icon: Icons.help_outline,
          title: 'Trợ giúp',
          onTap: () => _navigateToHelp(context),
        ),
        MenuItem(
          icon: Icons.info_outline,
          title: 'Giới thiệu',
          onTap: () => _navigateToAbout(context),
        ),
        MenuItem(
          icon: Icons.logout,
          title: 'Đăng xuất',
          onTap: () => _showLogoutDialog(context),
          color: AppColors.error,
        ),
      ],
    );
  }

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  Color _getTierColor(String tier) {
    switch (tier.toLowerCase()) {
      case 'silver':
        return AppColors.silver;
      case 'gold':
        return AppColors.gold;
      case 'platinum':
        return const Color(0xFFE5E4E2);
      case 'diamond':
        return AppColors.diamond;
      default:
        return AppColors.textSecondary;
    }
  }

  IconData _getTierIcon(String tier) {
    switch (tier.toLowerCase()) {
      case 'silver':
        return Icons.star_border;
      case 'gold':
        return Icons.star_half;
      case 'platinum':
        return Icons.star;
      case 'diamond':
        return Icons.diamond;
      default:
        return Icons.star_border;
    }
  }

  // ==========================================
  // NAVIGATION METHODS
  // ==========================================

  void _navigateToSettings(BuildContext context) {
    Navigator.pushNamed(context, '/settings');
  }

  void _navigateToLoyaltyHistory(BuildContext context) {
    Navigator.pushNamed(context, '/loyalty-history');
  }

  void _navigateToVouchers(BuildContext context) {
    Navigator.pushNamed(context, '/vouchers');
  }

  void _navigateToHistory(BuildContext context) {
    Navigator.pushNamed(context, '/service-history');
  }

  void _navigateToOrders(BuildContext context) {
    Navigator.pushNamed(context, '/orders');
  }

  void _navigateToSkinRecords(BuildContext context) {
    Navigator.pushNamed(context, '/skin-records');
  }

  void _navigateToHelp(BuildContext context) {
    Navigator.pushNamed(context, '/help');
  }

  void _navigateToAbout(BuildContext context) {
    Navigator.pushNamed(context, '/about');
  }

  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Đăng xuất'),
        content: const Text('Bạn có chắc chắn muốn đăng xuất khỏi tài khoản không?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đóng'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _logout(context);
            },
            style: TextButton.styleFrom(
              foregroundColor: Colors.red,
            ),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
  }

  void _logout(BuildContext context) {
    // Clear auth state
    context.read<AuthBloc>().add(const LogoutEvent());

    // Navigate to login
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }
}