import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:shimmer/shimmer.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/constants/app_strings.dart';
import 'package:spa_shared/widgets/loading_shimmer.dart';
import 'package:spa_shared/widgets/error_widget.dart';
import '../../bloc/home/home_bloc.dart';
import '../../bloc/home/home_event.dart';
import '../../bloc/home/home_state.dart';
import '../../widgets/quick_action_button.dart';
import '../../widgets/service_card.dart';
import '../../widgets/product_card.dart';
import '../../widgets/membership_card.dart';
import '../../widgets/ai_banner.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    // Load initial data
    context.read<HomeBloc>().add(const HomeDataRequested());
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      body: BlocBuilder<HomeBloc, HomeState>(
        builder: (context, state) {
          if (state is HomeLoading) {
            return const HomeShimmer();
          }

          if (state is HomeError) {
            return Center(
              child: CustomErrorWidget(
                message: state.message,
                onRetry: () => context.read<HomeBloc>().add(const HomeDataRequested()),
              ),
            );
          }

          return CustomScrollView(
            slivers: [
              // Luxury Header
              SliverAppBar(
                expandedHeight: 260,
                floating: false,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  background: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF2C3E50), Color(0xFF4A6B8A)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    child: SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                // User avatar with placeholder
                                GestureDetector(
                                  onTap: () => _navigateToProfile(context),
                                  child: CircleAvatar(
                                    radius: 24,
                                    backgroundColor: Colors.white24,
                                    child: state.user?.avatarUrl != null
                                        ? CachedNetworkImage(
                                            imageUrl: state.user!.avatarUrl!,
                                            imageBuilder: (context, imageProvider) => CircleAvatar(
                                              radius: 24,
                                              backgroundImage: imageProvider,
                                            ),
                                            placeholder: (context, url) => const Icon(
                                              Icons.person,
                                              color: Colors.white,
                                            ),
                                            errorWidget: (context, url, error) =>
                                                const Icon(Icons.person, color: Colors.white),
                                          )
                                        : const Icon(Icons.person, color: Colors.white),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Xin chào',
                                      style: GoogleFonts.inter(
                                        color: Colors.white70,
                                        fontSize: 13,
                                      ),
                                    ),
                                    Text(
                                      state.user?.fullName ?? 'Beauty AI',
                                      style: GoogleFonts.playfairDisplay(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                                const Spacer(),
                                Stack(
                                  children: [
                                    IconButton(
                                      icon: const Icon(
                                        Icons.notifications_outlined,
                                        color: Colors.white,
                                      ),
                                      onPressed: () => _navigateToNotifications(context),
                                    ),
                                    if (state.unreadNotifications > 0)
                                      Positioned(
                                        right: 8,
                                        top: 8,
                                        child: Container(
                                          padding: const EdgeInsets.all(4),
                                          decoration: const BoxDecoration(
                                            color: Colors.red,
                                            shape: BoxShape.circle,
                                          ),
                                          constraints: const BoxConstraints(
                                            minWidth: 16,
                                            minHeight: 16,
                                          ),
                                          child: Text(
                                            state.unreadNotifications > 9
                                                ? '9+'
                                                : '${state.unreadNotifications}',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 9,
                                              fontWeight: FontWeight.bold,
                                            ),
                                            textAlign: TextAlign.center,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),
                            // Membership Card
                            MembershipCard(
                              tier: state.membershipTier,
                              points: state.loyaltyPoints,
                              nextTier: state.nextMembershipTier,
                              pointsToNext: state.pointsToNextTier,
                              onUpgrade: () => _navigateToMembership(context),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // Quick Actions
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Quick Actions Row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          QuickActionButton(
                            icon: Icons.calendar_today,
                            label: 'Đặt lịch',
                            onTap: () => _navigateToBooking(context),
                            color: AppColors.primary,
                          ),
                          QuickActionButton(
                            icon: Icons.face_retouching_natural,
                            label: 'Phân tích da',
                            onTap: () => _navigateToSkinAnalysis(context),
                            color: const Color(0xFFB76E79),
                          ),
                          QuickActionButton(
                            icon: Icons.auto_awesome,
                            label: 'AI Tư vấn',
                            onTap: () => _navigateToAi(context),
                            color: const Color(0xFF8B5CF6),
                          ),
                          QuickActionButton(
                            icon: Icons.card_giftcard,
                            label: 'Voucher',
                            onTap: () => _navigateToVouchers(context),
                            color: AppColors.gold,
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // AI Beauty Assistant Banner
                      AiBanner(
                        onTap: () => _navigateToAi(context),
                      ),
                      const SizedBox(height: 24),

                      // Popular Services
                      _buildSectionHeader(
                        title: 'Dịch vụ phổ biến',
                        onSeeAll: () => _navigateToServices(context),
                      ),
                      const SizedBox(height: 12),
                      _buildServiceList(state.popularServices, context),

                      const SizedBox(height: 24),

                      // Featured Products
                      _buildSectionHeader(
                        title: 'Sản phẩm nổi bật',
                        onSeeAll: () => _navigateToShop(context),
                      ),
                      const SizedBox(height: 12),
                      _buildProductList(state.featuredProducts, context),

                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader({required String title, VoidCallback? onSeeAll}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (onSeeAll != null)
          TextButton(
            onPressed: onSeeAll,
            child: Text(
              'Xem tất cả',
              style: GoogleFonts.inter(
                color: AppColors.primary,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildServiceList(List<dynamic> services, BuildContext context) {
    if (services.isEmpty) {
      return const SizedBox(
        height: 180,
        child: Center(
          child: Text('Không có dịch vụ nào'),
        ),
      );
    }

    return SizedBox(
      height: 200,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: services.length,
        itemBuilder: (context, index) {
          final service = services[index];
          return ServiceCard(
            id: service.id,
            name: service.name,
            price: service.price,
            imageUrl: service.imageUrl,
            duration: service.durationMinutes,
            discountPrice: service.discountPrice,
            rating: service.rating,
            onTap: () => _navigateToServiceDetail(context, service.id),
          );
        },
      ),
    );
  }

  Widget _buildProductList(List<dynamic> products, BuildContext context) {
    if (products.isEmpty) {
      return const SizedBox(
        height: 220,
        child: Center(
          child: Text('Không có sản phẩm nào'),
        ),
      );
    }

    return SizedBox(
      height: 260,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: products.length,
        itemBuilder: (context, index) {
          final product = products[index];
          return ProductCard(
            id: product.id,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl,
            brand: product.brand,
            isOnSale: product.isOnSale,
            discountPrice: product.discountPrice,
            onTap: () => _navigateToProductDetail(context, product.id),
          );
        },
      ),
    );
  }

  // ==========================================
  // NAVIGATION METHODS
  // ==========================================

  void _navigateToBooking(BuildContext context) {
    // Navigate to booking screen with tab index
    final navigationState = context.read<NavigationCubit>();
    navigationState.setTab(2); // Booking tab
  }

  void _navigateToAi(BuildContext context) {
    final navigationState = context.read<NavigationCubit>();
    navigationState.setTab(1); // AI tab
  }

  void _navigateToShop(BuildContext context) {
    final navigationState = context.read<NavigationCubit>();
    navigationState.setTab(3); // Shop tab
  }

  void _navigateToProfile(BuildContext context) {
    final navigationState = context.read<NavigationCubit>();
    navigationState.setTab(4); // Profile tab
  }

  void _navigateToNotifications(BuildContext context) {
    Navigator.pushNamed(context, '/notifications');
  }

  void _navigateToMembership(BuildContext context) {
    Navigator.pushNamed(context, '/membership');
  }

  void _navigateToSkinAnalysis(BuildContext context) {
    Navigator.pushNamed(context, '/skin-analysis');
  }

  void _navigateToVouchers(BuildContext context) {
    Navigator.pushNamed(context, '/vouchers');
  }

  void _navigateToServices(BuildContext context) {
    Navigator.pushNamed(context, '/services');
  }

  void _navigateToServiceDetail(BuildContext context, String serviceId) {
    Navigator.pushNamed(context, '/service-detail', arguments: serviceId);
  }

  void _navigateToProductDetail(BuildContext context, String productId) {
    Navigator.pushNamed(context, '/product-detail', arguments: productId);
  }
}

// ==========================================
// HOME SHIMMER (LOADING STATE)
// ==========================================
class HomeShimmer extends StatelessWidget {
  const HomeShimmer({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 260,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                color: Colors.grey[300],
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: const BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 80,
                                  height: 12,
                                  color: Colors.white,
                                ),
                                const SizedBox(height: 4),
                                Container(
                                  width: 120,
                                  height: 20,
                                  color: Colors.white,
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Container(
                          height: 80,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: List.generate(
                      4,
                      (index) => Container(
                        width: 60,
                        height: 80,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Container(
                        width: 120,
                        height: 24,
                        color: Colors.white,
                      ),
                      const Spacer(),
                      Container(
                        width: 80,
                        height: 20,
                        color: Colors.white,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 180,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: List.generate(
                        3,
                        (index) => Container(
                          width: 150,
                          margin: const EdgeInsets.only(right: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}